import Database from 'better-sqlite3';
import { Migration } from '../Migration.interface';

/**
 * Add batch tracking columns migration
 * Adds batch_id, request_id, and origin_data columns to operations table
 */
const migration: Migration = {
  version: 3,
  name: 'add_batch_tracking_columns',
  description: 'Add batch_id, request_id, and origin_data columns to operations',
  
  async up(db: Database.Database): Promise<void> {
    db.exec(`
      ALTER TABLE operations ADD COLUMN batch_id TEXT;
      ALTER TABLE operations ADD COLUMN request_id TEXT;
      ALTER TABLE operations ADD COLUMN origin_data TEXT;
    `);
  },
  
  async down(db: Database.Database): Promise<void> {
    // SQLite doesn't support DROP COLUMN, would need table recreation
    // For now, we'll throw an error to indicate rollback is not supported
    throw new Error('Rollback not supported for column additions in SQLite. Manual intervention required.');
  }
};

export default migration;