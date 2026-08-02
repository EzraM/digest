import Database from "better-sqlite3";
import { SqliteCredentialStore } from "./CredentialStore";
import { IntegrationAccountStore } from "./IntegrationAccountStore";
import { GoogleCalendarPlugin } from "./google-calendar/GoogleCalendarPlugin";
import {
  BrowserGoogleOAuthAuthorizer,
  GoogleOAuthAuthorizer,
  GoogleOAuthGrant,
} from "./google-calendar/GoogleOAuthAuthorizer";
import { ScheduledJob } from "../scheduler/ScheduledJobStore";

const createDatabase = () => {
  const database = new Database(":memory:");
  database.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE integration_credentials (
      key TEXT PRIMARY KEY,
      encrypted_value BLOB NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE integration_accounts (
      id TEXT PRIMARY KEY,
      integration_id TEXT NOT NULL,
      provider_account_id TEXT NOT NULL,
      display_name TEXT NOT NULL,
      email TEXT NOT NULL,
      scopes_json TEXT NOT NULL DEFAULT '[]',
      credential_key TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(integration_id, provider_account_id),
      FOREIGN KEY(credential_key) REFERENCES integration_credentials(key)
    );
  `);
  return database;
};

class FakeAuthorizer implements GoogleOAuthAuthorizer {
  revoked: string[] = [];

  constructor(private readonly grant: GoogleOAuthGrant) {}

  async authorize(): Promise<GoogleOAuthGrant> {
    return this.grant;
  }

  async revoke(refreshToken: string): Promise<void> {
    this.revoked.push(refreshToken);
  }
}

describe("GoogleCalendarPlugin", () => {
  it("connects, remembers identity securely, and disconnects cleanly", async () => {
    const database = createDatabase();
    const encryption = {
      encrypt: async (value: string) => Buffer.from(`encrypted:${value}`),
      decrypt: async (value: Buffer) =>
        value.toString().replace(/^encrypted:/, ""),
    };
    const credentials = new SqliteCredentialStore(database, encryption, () => 10);
    const accounts = new IntegrationAccountStore(database, () => 10);
    const authorizer = new FakeAuthorizer({
      providerAccountId: "google-user-1",
      displayName: "Ada Lovelace",
      email: "ada@example.test",
      scopes: ["openid", "https://www.googleapis.com/auth/calendar.readonly"],
      refreshToken: "refresh-secret",
    });
    const plugin = new GoogleCalendarPlugin(accounts, credentials, authorizer);

    const connected = await plugin.connect();
    expect(connected.email).toBe("ada@example.test");
    expect(plugin.listAccounts().length).toBe(1);
    const stored = database
      .prepare("SELECT encrypted_value FROM integration_credentials")
      .get() as { encrypted_value: Buffer };
    expect(stored.encrypted_value.toString()).toBe("encrypted:refresh-secret");

    await plugin.disconnect(connected.id);
    expect(authorizer.revoked).toEqual(["refresh-secret"]);
    expect(plugin.listAccounts()).toEqual([]);
    expect(
      database.prepare("SELECT COUNT(*) AS count FROM integration_credentials").get()
    ).toMatchObject({ count: 0 });
    database.close();
  });

  it("keeps the connection when Google revocation fails", async () => {
    const database = createDatabase();
    const credentials = new SqliteCredentialStore(database, {
      encrypt: async (value) => Buffer.from(value),
      decrypt: async (value) => value.toString(),
    });
    const accounts = new IntegrationAccountStore(database);
    const authorizer: GoogleOAuthAuthorizer = {
      authorize: async () => ({
        providerAccountId: "user",
        displayName: "User",
        email: "user@example.test",
        scopes: [],
        refreshToken: "refresh",
      }),
      revoke: async () => {
        throw new Error("offline");
      },
    };
    const plugin = new GoogleCalendarPlugin(accounts, credentials, authorizer);
    const connected = await plugin.connect();

    let failed = false;
    try {
      await plugin.disconnect(connected.id);
    } catch {
      failed = true;
    }
    expect(failed).toBe(true);
    expect(plugin.listAccounts().length).toBe(1);
    database.close();
  });

  it("schedules and repeats account sync through its job handler", async () => {
    const database = createDatabase();
    const credentials = new SqliteCredentialStore(database, {
      encrypt: async (value) => Buffer.from(value),
      decrypt: async (value) => value.toString(),
    });
    const accounts = new IntegrationAccountStore(database);
    const authorizer = new FakeAuthorizer({
      providerAccountId: "scheduled-user",
      displayName: "Scheduled User",
      email: "scheduled@example.test",
      scopes: [],
      refreshToken: "refresh",
    });
    const scheduled: Array<Omit<ScheduledJob<unknown>, "attempts">> = [];
    const removed: string[] = [];
    const synced: string[] = [];
    const scheduler = {
      schedule: <State>(job: Omit<ScheduledJob<State>, "attempts">) =>
        scheduled.push(job as Omit<ScheduledJob<unknown>, "attempts">),
      removeOwner: (ownerId: string) => removed.push(ownerId),
    };
    const plugin = new GoogleCalendarPlugin(
      accounts,
      credentials,
      authorizer,
      scheduler,
      { sync: async (accountId) => void synced.push(accountId) },
      () => 1_000
    );

    const account = await plugin.connect();
    expect(scheduled[0]).toMatchObject({
      ownerId: account.id,
      kind: "google-calendar.sync",
      runAt: 1_000,
    });
    const result = await plugin.jobHandlers[0].run({
      ...scheduled[0],
      state: { accountId: account.id },
      attempts: 0,
    });
    expect(synced).toEqual([account.id]);
    expect(result).toMatchObject({ runAt: 901_000 });
    await plugin.disconnect(account.id);
    expect(removed).toEqual([account.id]);
    database.close();
  });
});

describe("BrowserGoogleOAuthAuthorizer", () => {
  it("uses a loopback PKCE flow and returns the Google identity", async () => {
    let authorizationUrl: URL | undefined;
    const requests: string[] = [];
    const authorizer = new BrowserGoogleOAuthAuthorizer(
      "desktop-client-id",
      async (url) => {
        authorizationUrl = new URL(url);
        const redirectUri = authorizationUrl.searchParams.get("redirect_uri");
        const state = authorizationUrl.searchParams.get("state");
        if (!redirectUri || !state) throw new Error("Missing OAuth callback data");
        await fetch(`${redirectUri}?code=authorization-code&state=${state}`);
      },
      async (input, init) => {
        const url = String(input);
        requests.push(url);
        if (url.endsWith("/token")) {
          const body = init?.body as URLSearchParams;
          expect(body.get("code_verifier")?.length ?? 0).toBe(64);
          return new Response(
            JSON.stringify({
              access_token: "access",
              refresh_token: "refresh",
              scope: "openid email",
            }),
            { status: 200 }
          );
        }
        return new Response(
          JSON.stringify({
            sub: "google-user",
            email: "person@example.test",
            name: "Person",
          }),
          { status: 200 }
        );
      }
    );

    const grant = await authorizer.authorize();
    expect(authorizationUrl?.hostname).toBe("accounts.google.com");
    expect(authorizationUrl?.searchParams.get("code_challenge_method")).toBe(
      "S256"
    );
    expect(grant).toMatchObject({
      providerAccountId: "google-user",
      email: "person@example.test",
      refreshToken: "refresh",
    });
    expect(requests).toEqual([
      "https://oauth2.googleapis.com/token",
      "https://openidconnect.googleapis.com/v1/userinfo",
    ]);
  });
});
