import Database from "better-sqlite3";
import { SqliteCredentialStore } from "./CredentialStore";
import { IntegrationAccountStore } from "./IntegrationAccountStore";
import {
  DefaultGoogleAuthorizationProvider,
} from "./google/GoogleAuthorizationService";
import { GoogleAuthorizationStore } from "./google/GoogleAuthorizationStore";
import {
  GoogleOAuthAuthorizer,
  GoogleOAuthGrant,
} from "./google/GoogleOAuthAuthorizer";

const createDatabase = () => {
  const database = new Database(":memory:");
  database.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE integration_credentials (
      key TEXT PRIMARY KEY, encrypted_value BLOB NOT NULL,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE integration_accounts (
      id TEXT PRIMARY KEY, integration_id TEXT NOT NULL,
      provider_account_id TEXT NOT NULL, display_name TEXT NOT NULL,
      email TEXT NOT NULL, scopes_json TEXT NOT NULL DEFAULT '[]',
      credential_key TEXT NOT NULL, created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL, UNIQUE(integration_id, provider_account_id),
      FOREIGN KEY(credential_key) REFERENCES integration_credentials(key)
    );
    CREATE TABLE google_authorization_consumers (
      account_id TEXT NOT NULL, consumer_id TEXT NOT NULL,
      scopes_json TEXT NOT NULL, created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL, PRIMARY KEY(account_id, consumer_id),
      FOREIGN KEY(account_id) REFERENCES integration_accounts(id) ON DELETE CASCADE
    );
  `);
  return database;
};

class FakeAuthorizer implements GoogleOAuthAuthorizer {
  requested: Array<readonly string[]> = [];
  revoked: string[] = [];

  constructor(private readonly grant: GoogleOAuthGrant) {}

  async authorize(scopes: readonly string[]): Promise<GoogleOAuthGrant> {
    this.requested = [...this.requested, scopes];
    return this.grant;
  }

  async revoke(token: string): Promise<void> {
    this.revoked.push(token);
  }
}

describe("DefaultGoogleAuthorizationProvider", () => {
  it("stores refresh credentials and issues consumer-scoped access tokens", async () => {
    const database = createDatabase();
    const calendarScope = "https://www.googleapis.com/auth/calendar.readonly";
    const driveScope = "https://www.googleapis.com/auth/drive.metadata.readonly";
    const authorizer = new FakeAuthorizer({
      providerAccountId: "person",
      displayName: "Person",
      email: "person@example.test",
      scopes: ["openid", "email", "profile", calendarScope, driveScope],
      refreshToken: "refresh-secret",
    });
    const credentials = new SqliteCredentialStore(database, {
      encrypt: async (value) => Buffer.from(`encrypted:${value}`),
      decrypt: async (value) => value.toString().replace(/^encrypted:/, ""),
    });
    let refreshScope: string | null = null;
    let refreshClientSecret: string | null = null;
    const provider = new DefaultGoogleAuthorizationProvider(
      "web-client",
      new IntegrationAccountStore(database),
      new GoogleAuthorizationStore(database),
      credentials,
      authorizer,
      async (_input, init) => {
        refreshScope = (init?.body as URLSearchParams).get("scope");
        refreshClientSecret = (init?.body as URLSearchParams).get("client_secret");
        return new Response(
          JSON.stringify({
            access_token: "calendar-access",
            expires_in: 3600,
            scope: calendarScope,
          }),
          { status: 200 }
        );
      },
      () => 1_000,
      "desktop-client-secret"
    );
    const calendar = provider.forConsumer({
      consumerId: "google-calendar",
      scopes: [calendarScope],
    });

    const account = await calendar.connect();
    expect(authorizer.requested[0]).toContain(calendarScope);
    expect(
      (database.prepare("SELECT encrypted_value FROM integration_credentials").get() as {
        encrypted_value: Buffer;
      }).encrypted_value.toString()
    ).toBe("encrypted:refresh-secret");
    expect(await calendar.accessToken(account.id)).toBe("calendar-access");
    expect(refreshScope).toBe(calendarScope);
    expect(refreshClientSecret).toBe("desktop-client-secret");
    database.close();
  });

  it("removes one consumer without revoking an account used by another", async () => {
    const database = createDatabase();
    const calendarScope = "calendar.scope";
    const driveScope = "drive.scope";
    const authorizer = new FakeAuthorizer({
      providerAccountId: "person",
      displayName: "Person",
      email: "person@example.test",
      scopes: ["openid", "email", "profile", calendarScope, driveScope],
      refreshToken: "refresh",
    });
    const provider = new DefaultGoogleAuthorizationProvider(
      "client",
      new IntegrationAccountStore(database),
      new GoogleAuthorizationStore(database),
      new SqliteCredentialStore(database, {
        encrypt: async (value) => Buffer.from(value),
        decrypt: async (value) => value.toString(),
      }),
      authorizer
    );
    const calendar = provider.forConsumer({
      consumerId: "calendar",
      scopes: [calendarScope],
    });
    const drive = provider.forConsumer({ consumerId: "drive", scopes: [driveScope] });
    const account = await calendar.connect();
    await drive.connect();

    await calendar.disconnect(account.id);
    expect(authorizer.revoked).toEqual([]);
    expect(calendar.accounts()).toEqual([]);
    expect(drive.accounts().length).toBe(1);
    await drive.disconnect(account.id);
    expect(authorizer.revoked).toEqual(["refresh"]);
    expect(drive.accounts()).toEqual([]);
    database.close();
  });
});
