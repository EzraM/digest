import Database from 'better-sqlite3';
import { Migration } from '../Migration.interface';

/**
 * Initial operations schema migration
 * Creates operations, documents, and snapshots tables
 */
const migration: Migration = {
  version: 1,
  name: 'initial_operations_schema',
  description: 'Create operations, documents, and snapshots tables',
  
  async up(db: Database.Database): Promise<void> {
    db.exec(`
      -- Operations table for event sourcing with transaction metadata
      CREATE TABLE IF NOT EXISTS operations (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        operation_type TEXT NOT NULL,
        block_id TEXT NOT NULL,
        operation_data TEXT NOT NULL,
        applied_at INTEGER NOT NULL,
        source TEXT NOT NULL,
        user_id TEXT,
        checksum TEXT
      );
      
      -- Documents table for metadata
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        title TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        block_count INTEGER DEFAULT 0
      );
      
      -- Snapshots table for performance (periodic Y.Doc snapshots)
      CREATE TABLE IF NOT EXISTS snapshots (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        snapshot_data BLOB NOT NULL,
        created_at INTEGER NOT NULL,
        operation_count INTEGER NOT NULL
      );
      
      -- Create indexes for performance
      CREATE INDEX IF NOT EXISTS idx_operations_document ON operations(document_id, applied_at);
      CREATE INDEX IF NOT EXISTS idx_operations_block ON operations(block_id);
      CREATE INDEX IF NOT EXISTS idx_snapshots_document ON snapshots(document_id, created_at);
    `);
  },
  
  async down(db: Database.Database): Promise<void> {
    db.exec(`
      DROP INDEX IF EXISTS idx_snapshots_document;
      DROP INDEX IF EXISTS idx_operations_block;
      DROP INDEX IF EXISTS idx_operations_document;
      DROP TABLE IF EXISTS snapshots;
      DROP TABLE IF EXISTS documents;
      DROP TABLE IF EXISTS operations;
    `);
  }
};

export default migration;