import { CredentialStore } from "../CredentialStore";
import {
  IntegrationAccountStore,
  StoredIntegrationAccount,
} from "../IntegrationAccountStore";
import { GoogleOAuthAuthorizer } from "./GoogleOAuthAuthorizer";
import { GoogleAuthorizationStore } from "./GoogleAuthorizationStore";

type Fetch = typeof fetch;

export interface GoogleAuthorization {
  accounts(): StoredIntegrationAccount[];
  connect(): Promise<StoredIntegrationAccount>;
  accessToken(accountId: string): Promise<string>;
  disconnect(accountId: string): Promise<void>;
  cancelConnect?(): void;
}

export interface GoogleAuthorizationProvider {
  forConsumer(request: {
    consumerId: string;
    scopes: readonly string[];
  }): GoogleAuthorization;
}

const IDENTITY_SCOPES = ["openid", "email", "profile"] as const;

const normalizeScopes = (scopes: readonly string[]): string[] =>
  [...new Set(scopes)].sort();

export class DefaultGoogleAuthorizationProvider
  implements GoogleAuthorizationProvider
{
  private readonly tokenCache = new Map<
    string,
    { token: string; expiresAt: number }
  >();

  constructor(
    private readonly clientId: string,
    private readonly accounts: IntegrationAccountStore,
    private readonly grants: GoogleAuthorizationStore,
    private readonly credentials: CredentialStore,
    private readonly authorizer: GoogleOAuthAuthorizer,
    private readonly fetcher: Fetch = fetch,
    private readonly now: () => number = () => Date.now(),
    private readonly clientSecret = ""
  ) {}

  forConsumer(request: {
    consumerId: string;
    scopes: readonly string[];
  }): GoogleAuthorization {
    if (!request.consumerId) throw new Error("Google consumer ID is required");
    const scopes = normalizeScopes(request.scopes);
    if (scopes.length === 0) throw new Error("Google consumer scopes are required");
    return {
      accounts: () => this.consumerAccounts(request.consumerId),
      connect: () => this.connect(request.consumerId, scopes),
      accessToken: (accountId) =>
        this.accessToken(request.consumerId, accountId, scopes),
      disconnect: (accountId) => this.disconnect(request.consumerId, accountId),
      cancelConnect: () => this.authorizer.cancel?.(),
    };
  }

  private consumerAccounts(consumerId: string): StoredIntegrationAccount[] {
    return this.grants
      .accountIds(consumerId)
      .map((accountId) => this.accounts.get(accountId))
      .filter((account): account is StoredIntegrationAccount => account !== null);
  }

  private async connect(
    consumerId: string,
    scopes: string[]
  ): Promise<StoredIntegrationAccount> {
    const grant = await this.authorizer.authorize([
      ...IDENTITY_SCOPES,
      ...scopes,
    ]);
    const missing = scopes.filter((scope) => !grant.scopes.includes(scope));
    if (missing.length > 0) {
      await this.authorizer.revoke(grant.refreshToken);
      throw new Error(`Google did not grant required scopes: ${missing.join(", ")}`);
    }
    const id = `google:${grant.providerAccountId}`;
    const credentialKey = `${id}:refresh-token`;
    await this.credentials.write(credentialKey, grant.refreshToken);
    const account: StoredIntegrationAccount = {
      id,
      integrationId: "google",
      providerAccountId: grant.providerAccountId,
      displayName: grant.displayName,
      email: grant.email,
      scopes: normalizeScopes(grant.scopes),
      credentialKey,
    };
    try {
      this.accounts.put(account);
      this.grants.bind(account.id, consumerId, scopes);
      return account;
    } catch (error) {
      await this.credentials.remove(credentialKey);
      throw error;
    }
  }

  private async accessToken(
    consumerId: string,
    accountId: string,
    declaredScopes: string[]
  ): Promise<string> {
    const grantedScopes = this.grants.scopes(accountId, consumerId);
    if (!grantedScopes) {
      throw new Error(`Google account is not bound to consumer: ${consumerId}`);
    }
    if (declaredScopes.some((scope) => !grantedScopes.includes(scope))) {
      throw new Error(`Google consumer scope declaration changed: ${consumerId}`);
    }
    const cacheKey = `${accountId}\n${declaredScopes.join(" ")}`;
    const cached = this.tokenCache.get(cacheKey);
    if (cached && cached.expiresAt - 60_000 > this.now()) return cached.token;
    const account = this.accounts.get(accountId);
    if (!account) throw new Error(`Unknown Google account: ${accountId}`);
    const refreshToken = await this.credentials.read(account.credentialKey);
    if (!refreshToken) throw new Error(`Missing Google credential: ${accountId}`);
    const response = await this.fetcher("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.clientId,
        ...(this.clientSecret ? { client_secret: this.clientSecret } : {}),
        refresh_token: refreshToken,
        grant_type: "refresh_token",
        scope: declaredScopes.join(" "),
      }),
    });
    if (!response.ok) throw new Error(`Google token refresh failed (${response.status})`);
    const result = (await response.json()) as {
      access_token: string;
      expires_in: number;
      scope?: string;
    };
    const returnedScopes = result.scope?.split(" ").filter(Boolean);
    if (returnedScopes) {
      const missing = declaredScopes.filter(
        (scope) => !returnedScopes.includes(scope)
      );
      if (missing.length > 0) {
        throw new Error(`Google access token omitted scopes: ${missing.join(", ")}`);
      }
    }
    this.tokenCache.set(cacheKey, {
      token: result.access_token,
      expiresAt: this.now() + result.expires_in * 1_000,
    });
    return result.access_token;
  }

  private async disconnect(consumerId: string, accountId: string): Promise<void> {
    const account = this.accounts.get(accountId);
    if (!account || !this.grants.scopes(accountId, consumerId)) return;
    if (this.grants.consumerCount(accountId) > 1) {
      this.grants.unbind(accountId, consumerId);
      this.forget(accountId);
      return;
    }
    const refreshToken = await this.credentials.read(account.credentialKey);
    if (refreshToken) await this.authorizer.revoke(refreshToken);
    this.grants.unbind(accountId, consumerId);
    this.forget(accountId);
    this.accounts.remove(accountId);
    await this.credentials.remove(account.credentialKey);
  }

  private forget(accountId: string): void {
    for (const key of this.tokenCache.keys()) {
      if (key.startsWith(`${accountId}\n`)) this.tokenCache.delete(key);
    }
  }
}
