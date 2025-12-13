import Database from "better-sqlite3";
import { Migration } from "../Migration.interface";

const migration: Migration = {
  version: 5,
  name: "add_images_table",
  description: "Create images table for storing image blobs with metadata",

  async up(db: Database.Database): Promise<void> {
    db.exec(`
      CREATE TABLE IF NOT EXISTS images (
        id TEXT PRIMARY KEY,
        file_name TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        byte_length INTEGER NOT NULL,
        width INTEGER,
        height INTEGER,
        created_at INTEGER NOT NULL,
        owner_profile_id TEXT,
        document_id TEXT,
        blob BLOB NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_images_document ON images(document_id);
      CREATE INDEX IF NOT EXISTS idx_images_created ON images(created_at);
    `);
  },

  async down(db: Database.Database): Promise<void> {
    db.exec(`
      DROP INDEX IF EXISTS idx_images_created;
      DROP INDEX IF EXISTS idx_images_document;
      DROP TABLE IF EXISTS images;
    `);
  },
};

export default migration;


