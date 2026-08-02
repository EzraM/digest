import { CredentialStore } from "../CredentialStore";
import {
  IntegrationAccountStore,
  StoredIntegrationAccount,
} from "../IntegrationAccountStore";
import { IntegrationPlugin } from "../IntegrationPlugin";
import { GoogleOAuthAuthorizer } from "./GoogleOAuthAuthorizer";

export class GoogleCalendarPlugin implements IntegrationPlugin {
  readonly manifest = {
    id: "google-calendar",
    name: "Google Calendar",
    summary: "Projects upcoming Google Calendar events into Digest",
    connectionDescription: "Connect a Google account with read-only calendar access",
  };
  readonly jobHandlers = [];

  constructor(
    private readonly accounts: IntegrationAccountStore,
    private readonly credentials: CredentialStore,
    private readonly authorizer: GoogleOAuthAuthorizer
  ) {}

  listAccounts(): StoredIntegrationAccount[] {
    return this.accounts.list(this.manifest.id);
  }

  async connect(): Promise<StoredIntegrationAccount> {
    const grant = await this.authorizer.authorize();
    const id = `${this.manifest.id}:${grant.providerAccountId}`;
    const credentialKey = `${id}:refresh-token`;
    await this.credentials.write(credentialKey, grant.refreshToken);
    const account: StoredIntegrationAccount = {
      id,
      integrationId: this.manifest.id,
      providerAccountId: grant.providerAccountId,
      displayName: grant.displayName,
      email: grant.email,
      scopes: grant.scopes,
      credentialKey,
    };
    try {
      this.accounts.put(account);
      return account;
    } catch (error) {
      await this.credentials.remove(credentialKey);
      throw error;
    }
  }

  async disconnect(accountId: string): Promise<void> {
    const account = this.accounts.get(accountId);
    if (!account || account.integrationId !== this.manifest.id) return;
    const refreshToken = await this.credentials.read(account.credentialKey);
    if (refreshToken) await this.authorizer.revoke(refreshToken);
    this.accounts.remove(account.id);
    await this.credentials.remove(account.credentialKey);
  }
}
