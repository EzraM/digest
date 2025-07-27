import Database from 'better-sqlite3';
import { Migration, MigrationRecord } from './Migration.interface';
import { createHash } from 'crypto';
import { log } from '../utils/mainLogger';

/**
 * Manages database migration execution and tracking
 */
export class MigrationRunner {
  private db: Database.Database;

  constructor(database: Database.Database) {
    this.db = database;
  }

  /**
   * Initialize the migration tracking table
   */
  private async ensureMigrationsTable(): Promise<void> {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        applied_at INTEGER NOT NULL,
        checksum TEXT NOT NULL,
        execution_time_ms INTEGER
      )
    `);
  }

  /**
   * Get all applied migrations from the database
   */
  private getAppliedMigrations(): MigrationRecord[] {
    const stmt = this.db.prepare(`
      SELECT version, name, description, applied_at, checksum, execution_time_ms
      FROM schema_migrations
      ORDER BY version ASC
    `);
    return stmt.all() as MigrationRecord[];
  }

  /**
   * Calculate checksum for a migration to detect changes
   */
  private calculateMigrationChecksum(migration: Migration): string {
    const content = `${migration.version}_${migration.name}_${migration.description}`;
    return createHash('sha256').update(content).digest('hex');
  }

  /**
   * Get migrations that need to be applied
   */
  private async getPendingMigrations(allMigrations: Migration[]): Promise<Migration[]> {
    const appliedMigrations = this.getAppliedMigrations();
    const appliedVersions = new Set(appliedMigrations.map(m => m.version));

    return allMigrations
      .filter(migration => !appliedVersions.has(migration.version))
      .sort((a, b) => a.version - b.version);
  }

  /**
   * Execute a single migration
   */
  private async runMigration(migration: Migration): Promise<void> {
    const startTime = Date.now();
    
    try {
      await this.db.transaction(() => {
        // Execute the migration
        migration.up(this.db);
        
        // Record successful migration
        const insertStmt = this.db.prepare(`
          INSERT INTO schema_migrations (version, name, description, applied_at, checksum, execution_time_ms)
          VALUES (?, ?, ?, ?, ?, ?)
        `);
        
        insertStmt.run(
          migration.version,
          migration.name,
          migration.description,
          Date.now(),
          this.calculateMigrationChecksum(migration),
          Date.now() - startTime
        );
      })();
      
      log.debug(`✅ Migration ${migration.version} (${migration.name}) completed`, 'MigrationRunner');
    } catch (error) {
      log.debug(`❌ Migration ${migration.version} failed: ${error}`, 'MigrationRunner');
      throw error;
    }
  }

  /**
   * Run all pending migrations
   */
  async runMigrations(migrations: Migration[]): Promise<void> {
    await this.ensureMigrationsTable();
    
    const pendingMigrations = await this.getPendingMigrations(migrations);
    
    if (pendingMigrations.length === 0) {
      log.debug('No pending migrations', 'MigrationRunner');
      return;
    }

    log.debug(`Running ${pendingMigrations.length} pending migrations`, 'MigrationRunner');
    
    for (const migration of pendingMigrations) {
      await this.runMigration(migration);
    }
    
    log.debug('All migrations completed successfully', 'MigrationRunner');
  }

  /**
   * Rollback a migration by version
   */
  async rollbackMigration(version: number, migration: Migration): Promise<void> {
    const appliedMigrations = this.getAppliedMigrations();
    const migrationRecord = appliedMigrations.find(m => m.version === version);
    
    if (!migrationRecord) {
      throw new Error(`Migration ${version} is not applied`);
    }

    try {
      await this.db.transaction(() => {
        // Execute rollback
        migration.down(this.db);
        
        // Remove migration record
        const deleteStmt = this.db.prepare(`
          DELETE FROM schema_migrations WHERE version = ?
        `);
        deleteStmt.run(version);
      })();
      
      log.debug(`✅ Migration ${version} (${migration.name}) rolled back`, 'MigrationRunner');
    } catch (error) {
      log.debug(`❌ Migration ${version} rollback failed: ${error}`, 'MigrationRunner');
      throw error;
    }
  }

  /**
   * Get migration status
   */
  getMigrationStatus(): MigrationRecord[] {
    return this.getAppliedMigrations();
  }
}