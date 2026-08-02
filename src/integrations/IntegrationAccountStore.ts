import Database from "better-sqlite3";
import { ConnectedIntegrationAccount } from "./IntegrationPlugin";

export interface StoredIntegrationAccount extends ConnectedIntegrationAccount {
  email: string;
  scopes: string[];
  credentialKey: string;
}

type AccountRow = {
  id: string;
  integration_id: string;
  provider_account_id: string;
  display_name: string;
  email: string;
  scopes_json: string;
  credential_key: string;
};

export class IntegrationAccountStore {
  constructor(
    private readonly database: Database.Database,
    private readonly now: () => number = () => Date.now()
  ) {}

  put(account: StoredIntegrationAccount): void {
    const now = this.now();
    this.database.prepare(`
      INSERT INTO integration_accounts
        (id, integration_id, provider_account_id, display_name, email,
         scopes_json, credential_key, created_at, updated_at)
      VALUES
        (@id, @integrationId, @providerAccountId, @displayName, @email,
         @scopesJson, @credentialKey, @now, @now)
      ON CONFLICT(integration_id, provider_account_id) DO UPDATE SET
        display_name = excluded.display_name,
        email = excluded.email,
        scopes_json = excluded.scopes_json,
        credential_key = excluded.credential_key,
        updated_at = excluded.updated_at
    `).run({ ...account, scopesJson: JSON.stringify(account.scopes), now });
  }

  get(id: string): StoredIntegrationAccount | null {
    const row = this.database.prepare(`
      SELECT id, integration_id, provider_account_id, display_name, email,
             scopes_json, credential_key
      FROM integration_accounts WHERE id = ?
    `).get(id) as AccountRow | undefined;
    return row ? this.fromRow(row) : null;
  }

  list(integrationId?: string): StoredIntegrationAccount[] {
    const rows = (integrationId
      ? this.database.prepare(`
          SELECT id, integration_id, provider_account_id, display_name, email,
                 scopes_json, credential_key
          FROM integration_accounts WHERE integration_id = ?
          ORDER BY display_name, id
        `).all(integrationId)
      : this.database.prepare(`
          SELECT id, integration_id, provider_account_id, display_name, email,
                 scopes_json, credential_key
          FROM integration_accounts ORDER BY integration_id, display_name, id
        `).all()) as AccountRow[];
    return rows.map((row) => this.fromRow(row));
  }

  remove(id: string): void {
    this.database.prepare("DELETE FROM integration_accounts WHERE id = ?").run(id);
  }

  private fromRow(row: AccountRow): StoredIntegrationAccount {
    return {
      id: row.id,
      integrationId: row.integration_id,
      providerAccountId: row.provider_account_id,
      displayName: row.display_name,
      email: row.email,
      scopes: JSON.parse(row.scopes_json),
      credentialKey: row.credential_key,
    };
  }
}
