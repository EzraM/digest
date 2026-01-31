import Database from "better-sqlite3";
import { Migration } from "../Migration.interface";

/**
 * Migration 006: Add vector search tables for semantic search
 *
 * Creates:
 * - block_embeddings: Metadata table linking vectors to blocks
 * - block_vectors: sqlite-vec virtual table for similarity search
 *
 * Note: sqlite-vec extension must be loaded before this migration runs.
 * The virtual table uses float[1536] for OpenAI ada-002 compatibility,
 * but works with any embedding dimension.
 */
const migration: Migration = {
  version: 6,
  name: "add_vector_search",
  description: "Create vector search tables using sqlite-vec",

  async up(db: Database.Database): Promise<void> {
    // Metadata table - stores block info alongside vector rowid
    db.exec(`
      CREATE TABLE IF NOT EXISTS block_embeddings (
        id TEXT PRIMARY KEY,
        block_id TEXT NOT NULL,
        document_id TEXT NOT NULL,
        block_type TEXT NOT NULL,
        text_preview TEXT,
        embedding_model TEXT NOT NULL,
        dimensions INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE(block_id)
      );

      CREATE INDEX IF NOT EXISTS idx_block_embeddings_document
        ON block_embeddings(document_id);
      CREATE INDEX IF NOT EXISTS idx_block_embeddings_block
        ON block_embeddings(block_id);
      CREATE INDEX IF NOT EXISTS idx_block_embeddings_updated
        ON block_embeddings(updated_at);
    `);

    // Note: The vec0 virtual table is created dynamically by SqliteVectorStore
    // because it requires the sqlite-vec extension to be loaded first,
    // and the dimension may vary based on the embedding provider.
  },

  async down(db: Database.Database): Promise<void> {
    db.exec(`
      DROP TABLE IF EXISTS block_vectors;
      DROP INDEX IF EXISTS idx_block_embeddings_updated;
      DROP INDEX IF EXISTS idx_block_embeddings_block;
      DROP INDEX IF EXISTS idx_block_embeddings_document;
      DROP TABLE IF EXISTS block_embeddings;
    `);
  },
};

export default migration;
