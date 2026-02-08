import Database from "better-sqlite3";
import { app } from "electron";
import path from "path";
import fs from "fs";
import { MigrationRunner } from "./MigrationRunner";
import { Migration } from "./Migration.interface";
import { log } from "../utils/mainLogger";
import { isDevelopment } from "../config/development";

// Import all migrations
import migration001 from "./migrations/001_initial_operations_schema";
import migration002 from "./migrations/002_add_events_table";
import migration003 from "./migrations/003_add_batch_tracking_columns";
import migration004 from "./migrations/004_profiles_and_document_hierarchy";
import migration005 from "./migrations/005_add_images_table";
import migration006 from "./migrations/006_add_vector_search";
import migration007 from "./migrations/007_add_download_items_table";

/**
 * Singleton database manager that handles initialization and migrations
 */
export class DatabaseManager {
  private static instance: DatabaseManager;
  private db: Database.Database | null = null;
  private migrationRunner: MigrationRunner | null = null;
  private isInitialized = false;

  // All available migrations in order
  private migrations: Migration[] = [
    migration001,
    migration002,
    migration003,
    migration004,
    migration005,
    migration006,
    migration007,
  ];

  private constructor() {
    // Private constructor for singleton pattern
  }

  /**
   * Get the singleton instance
   */
  static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager();
    }
    return DatabaseManager.instance;
  }

  /**
   * Initialize the database and run migrations
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      let dbPath: string;
      if (isDevelopment()) {
        const devDbDir = path.join(process.cwd(), "db");
        fs.mkdirSync(devDbDir, { recursive: true });
        dbPath = path.join(devDbDir, "digest.db");
        log.debug(
          `Using development database path at: ${dbPath}`,
          "DatabaseManager"
        );
      } else {
        const userDataPath = app.getPath("userData");
        dbPath = path.join(userDataPath, "digest.db");
      }

      // Ensure directory exists
      fs.mkdirSync(path.dirname(dbPath), { recursive: true });

      // Create database connection
      this.db = new Database(dbPath);

      // Enable WAL mode for better concurrency
      this.db.exec("PRAGMA journal_mode = WAL");
      this.db.exec("PRAGMA synchronous = NORMAL");
      this.db.exec("PRAGMA cache_size = 1000");
      this.db.exec("PRAGMA foreign_keys = ON");

      // Initialize migration runner
      this.migrationRunner = new MigrationRunner(this.db);

      // Run all pending migrations
      await this.migrationRunner.runMigrations(this.migrations);

      this.isInitialized = true;
      log.debug(
        `Database initialized successfully at: ${dbPath}`,
        "DatabaseManager"
      );
    } catch (error) {
      log.debug(`Failed to initialize database: ${error}`, "DatabaseManager");
      throw error;
    }
  }

  /**
   * Get the database instance
   */
  getDatabase(): Database.Database {
    if (!this.db) {
      throw new Error("Database not initialized. Call initialize() first.");
    }
    return this.db;
  }

  /**
   * Get migration status
   */
  getMigrationStatus() {
    if (!this.migrationRunner) {
      throw new Error("Migration runner not initialized");
    }
    return this.migrationRunner.getMigrationStatus();
  }

  /**
   * Rollback a specific migration
   */
  async rollbackMigration(version: number): Promise<void> {
    if (!this.migrationRunner) {
      throw new Error("Migration runner not initialized");
    }

    const migration = this.migrations.find((m) => m.version === version);
    if (!migration) {
      throw new Error(`Migration ${version} not found`);
    }

    await this.migrationRunner.rollbackMigration(version, migration);
  }

  /**
   * Close the database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.migrationRunner = null;
      this.isInitialized = false;
      log.debug("Database connection closed", "DatabaseManager");
    }
  }

  /**
   * Check if database is initialized
   */
  get initialized(): boolean {
    return this.isInitialized;
  }
}
