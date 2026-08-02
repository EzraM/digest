import Database from "better-sqlite3";
import { Migration } from "../Migration.interface";

const migration: Migration = {
  version: 11,
  name: "add_scheduled_jobs",
  description: "Adds durable process-level jobs for background integrations",
  async up(db: Database.Database): Promise<void> {
    db.exec(`
      CREATE TABLE scheduled_jobs (
        id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        run_at INTEGER NOT NULL,
        state_json TEXT NOT NULL DEFAULT '{}',
        attempts INTEGER NOT NULL DEFAULT 0,
        lease_expires_at INTEGER,
        last_error TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX scheduled_jobs_due_idx
        ON scheduled_jobs(run_at, lease_expires_at);
    `);
  },
  async down(db: Database.Database): Promise<void> {
    db.exec("DROP TABLE IF EXISTS scheduled_jobs");
  },
};

export default migration;
