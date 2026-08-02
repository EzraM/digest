import Database from "better-sqlite3";
import { Migration } from "../Migration.interface";

const migration: Migration = {
  version: 12,
  name: "add_integration_accounts",
  description: "Adds connected integration accounts and encrypted credentials",
  async up(db: Database.Database): Promise<void> {
    db.exec(`
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

      CREATE INDEX integration_accounts_provider_idx
        ON integration_accounts(integration_id, provider_account_id);
    `);
  },
  async down(db: Database.Database): Promise<void> {
    db.exec("DROP TABLE IF EXISTS integration_accounts");
    db.exec("DROP TABLE IF EXISTS integration_credentials");
  },
};

export default migration;
