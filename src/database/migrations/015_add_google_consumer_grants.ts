import Database from "better-sqlite3";
import { Migration } from "../Migration.interface";

const migration: Migration = {
  version: 15,
  name: "add_google_consumer_grants",
  description: "Associates Google accounts with scope-constrained consumers",
  async up(db: Database.Database): Promise<void> {
    db.exec(`
      CREATE TABLE google_authorization_consumers (
        account_id TEXT NOT NULL,
        consumer_id TEXT NOT NULL,
        scopes_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY(account_id, consumer_id),
        FOREIGN KEY(account_id) REFERENCES integration_accounts(id) ON DELETE CASCADE
      );
    `);
  },
  async down(db: Database.Database): Promise<void> {
    db.exec("DROP TABLE IF EXISTS google_authorization_consumers");
  },
};

export default migration;
