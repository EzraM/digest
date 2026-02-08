import Database from "better-sqlite3";
import { Migration } from "../Migration.interface";

const migration: Migration = {
  version: 7,
  name: "add_download_items_table",
  description: "Create download_items table for tracking file download metadata",

  async up(db: Database.Database): Promise<void> {
    db.exec(`
      CREATE TABLE IF NOT EXISTS download_items (
        id TEXT PRIMARY KEY,
        document_id TEXT,
        block_id TEXT,
        file_name TEXT NOT NULL,
        mime_type TEXT,
        url TEXT NOT NULL,
        total_bytes INTEGER DEFAULT 0,
        received_bytes INTEGER DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'in_progress',
        save_path TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_download_items_status ON download_items(status);
      CREATE INDEX IF NOT EXISTS idx_download_items_created ON download_items(created_at);
    `);
  },

  async down(db: Database.Database): Promise<void> {
    db.exec(`
      DROP INDEX IF EXISTS idx_download_items_created;
      DROP INDEX IF EXISTS idx_download_items_status;
      DROP TABLE IF EXISTS download_items;
    `);
  },
};

export default migration;
