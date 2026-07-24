import Database from "better-sqlite3";
import { Migration } from "../Migration.interface";

const migration: Migration = {
  version: 10,
  name: "add_yjs_document_updates",
  description: "Persist incremental Yjs collaboration updates per document",

  async up(db: Database.Database): Promise<void> {
    db.exec(`
      CREATE TABLE IF NOT EXISTS yjs_document_updates (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        update_id TEXT NOT NULL UNIQUE,
        document_id TEXT NOT NULL,
        update_data BLOB NOT NULL,
        producer_renderer_id INTEGER,
        created_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_yjs_document_updates_document
        ON yjs_document_updates(document_id, sequence);
    `);
  },

  async down(db: Database.Database): Promise<void> {
    db.exec(`
      DROP INDEX IF EXISTS idx_yjs_document_updates_document;
      DROP TABLE IF EXISTS yjs_document_updates;
    `);
  },
};

export default migration;
