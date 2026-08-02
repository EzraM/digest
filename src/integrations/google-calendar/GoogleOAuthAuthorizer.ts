import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";

export interface GoogleOAuthGrant {
  providerAccountId: string;
  displayName: string;
  email: string;
  scopes: string[];
  refreshToken: string;
}

export interface GoogleOAuthAuthorizer {
  authorize(): Promise<GoogleOAuthGrant>;
  revoke(refreshToken: string): Promise<void>;
}

type Fetch = typeof fetch;

const encode = (value: Buffer): string => value.toString("base64url");

const listenForAuthorizationCode = (
  expectedState: string
): Promise<{ redirectUri: string; code: Promise<string> }> =>
  new Promise((ready, rejectReady) => {
    let resolveCode!: (code: string) => void;
    let rejectCode!: (error: Error) => void;
    const code = new Promise<string>((resolve, reject) => {
      resolveCode = resolve;
      rejectCode = reject;
    });
    const server = createServer((request, response) => {
      const address = server.address();
      if (!address || typeof address === "string" || !request.url) return;
      const redirectUri = `http://127.0.0.1:${address.port}/oauth/google/callback`;
      const url = new URL(request.url, redirectUri);
      if (url.pathname !== "/oauth/google/callback") {
        response.writeHead(404).end();
        return;
      }
      const error = url.searchParams.get("error");
      const state = url.searchParams.get("state");
      const code = url.searchParams.get("code");
      if (error || state !== expectedState || !code) {
        response.writeHead(400, { "Content-Type": "text/plain" });
        response.end("Digest could not connect this Google account. You may close this tab.");
        server.close();
        rejectCode(new Error(error ?? "Invalid Google OAuth callback"));
        return;
      }
      response.writeHead(200, { "Content-Type": "text/plain" });
      response.end("Google is connected to Digest. You may close this tab.");
      server.close();
      resolveCode(code);
    });
    server.once("error", (error) => {
      rejectReady(error);
      rejectCode(error);
    });
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        rejectReady(new Error("Google OAuth callback server did not bind"));
        return;
      }
      ready({
        redirectUri: `http://127.0.0.1:${address.port}/oauth/google/callback`,
        code,
      });
    });
    setTimeout(() => {
      server.close();
      rejectCode(new Error("Google authorization timed out"));
    }, 5 * 60_000).unref();
  });

export class BrowserGoogleOAuthAuthorizer implements GoogleOAuthAuthorizer {
  constructor(
    private readonly clientId: string,
    private readonly openExternal: (url: string) => Promise<unknown>,
    private readonly fetcher: Fetch = fetch
  ) {}

  async authorize(): Promise<GoogleOAuthGrant> {
    if (!this.clientId) throw new Error("GOOGLE_OAUTH_CLIENT_ID is not configured");
    const verifier = encode(randomBytes(48));
    const challenge = encode(createHash("sha256").update(verifier).digest());
    const state = encode(randomBytes(24));
    const callback = await listenForAuthorizationCode(state);
    const authorizationUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authorizationUrl.search = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: callback.redirectUri,
      response_type: "code",
      scope: [
        "openid",
        "email",
        "profile",
        "https://www.googleapis.com/auth/calendar.readonly",
      ].join(" "),
      access_type: "offline",
      prompt: "consent",
      code_challenge: challenge,
      code_challenge_method: "S256",
      state,
    }).toString();
    await this.openExternal(authorizationUrl.toString());
    const code = await callback.code;
    return this.exchange(code, callback.redirectUri, verifier);
  }

  async revoke(refreshToken: string): Promise<void> {
    const response = await this.fetcher("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: refreshToken }),
    });
    if (!response.ok) throw new Error(`Google token revocation failed (${response.status})`);
  }

  private async exchange(
    code: string,
    redirectUri: string,
    verifier: string
  ): Promise<GoogleOAuthGrant> {
    const tokenResponse = await this.fetcher("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.clientId,
        code,
        code_verifier: verifier,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }),
    });
    if (!tokenResponse.ok) {
      throw new Error(`Google token exchange failed (${tokenResponse.status})`);
    }
    const tokens = (await tokenResponse.json()) as {
      access_token: string;
      refresh_token?: string;
      scope?: string;
    };
    if (!tokens.refresh_token) throw new Error("Google did not return a refresh token");
    const profileResponse = await this.fetcher(
      "https://openidconnect.googleapis.com/v1/userinfo",
      { headers: { Authorization: `Bearer ${tokens.access_token}` } }
    );
    if (!profileResponse.ok) {
      throw new Error(`Google profile lookup failed (${profileResponse.status})`);
    }
    const profile = (await profileResponse.json()) as {
      sub: string;
      email: string;
      name?: string;
    };
    return {
      providerAccountId: profile.sub,
      displayName: profile.name ?? profile.email,
      email: profile.email,
      scopes: tokens.scope?.split(" ").filter(Boolean) ?? [],
      refreshToken: tokens.refresh_token,
    };
  }
}
