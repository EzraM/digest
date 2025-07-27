import Database from 'better-sqlite3';

/**
 * Interface for database migrations
 */
export interface Migration {
  /** Unique version number for the migration */
  version: number;
  
  /** Human-readable name for the migration */
  name: string;
  
  /** Description of what this migration does */
  description: string;
  
  /** Apply the migration */
  up(db: Database.Database): Promise<void>;
  
  /** Rollback the migration */
  down(db: Database.Database): Promise<void>;
}

/**
 * Migration execution record
 */
export interface MigrationRecord {
  version: number;
  name: string;
  description: string;
  applied_at: number;
  checksum: string;
  execution_time_ms: number;
}