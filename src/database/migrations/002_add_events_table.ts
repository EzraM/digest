import Database from 'better-sqlite3';
import { Migration } from '../Migration.interface';

/**
 * Add events table migration
 * Creates events table for application logging
 */
const migration: Migration = {
  version: 2,
  name: 'add_events_table',
  description: 'Add events table for application logging',
  
  async up(db: Database.Database): Promise<void> {
    db.exec(`
      -- Events table for application logging
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        session_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        event_data TEXT NOT NULL,
        metadata TEXT NOT NULL
      );
      
      -- Create indexes for events table
      CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
      CREATE INDEX IF NOT EXISTS idx_events_session_id ON events(session_id);
      CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
    `);
  },
  
  async down(db: Database.Database): Promise<void> {
    db.exec(`
      DROP INDEX IF EXISTS idx_events_type;
      DROP INDEX IF EXISTS idx_events_session_id;
      DROP INDEX IF EXISTS idx_events_timestamp;
      DROP TABLE IF EXISTS events;
    `);
  }
};

export default migration;