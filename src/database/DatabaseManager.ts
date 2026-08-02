import Database from "better-sqlite3";
import { app } from "electron";
import path from "path";
import fs from "fs";
import { MigrationRunner } from "./MigrationRunner";
import { Migration } from "./Migration.interface";
import { log } from "../utils/mainLogger";
import { isDevelopment } from "../config/development";

import migration001 from "./migrations/001_initial_operations_schema";
import migration002 from "./migrations/002_add_events_table";
import migration003 from "./migrations/003_add_batch_tracking_columns";
import migration004 from "./migrations/004_profiles_and_document_hierarchy";
import migration005 from "./migrations/005_add_images_table";
import migration006 from "./migrations/006_add_vector_search";
import migration007 from "./migrations/007_add_download_items_table";
import migration008 from "./migrations/008_add_live_page_cache_attempts";
import migration009 from "./migrations/009_add_profile_position";
import migration010 from "./migrations/010_add_yjs_document_updates";
import migration011 from "./migrations/011_add_scheduled_jobs";
import migration012 from "./migrations/012_add_integration_accounts";
import migration013 from "./migrations/013_add_calendar_projection";
import migration014 from "./migrations/014_add_join_delivery_state";
import migration015 from "./migrations/015_add_google_consumer_grants";

/** Singleton database manager that handles initialization and migrations. */
export class DatabaseManager {
  private static instance: DatabaseManager;
  private db: Database.Database | null = null;
  private migrationRunner: MigrationRunner | null = null;
  private isInitialized = false;

  private migrations: Migration[] = [
    migration001,
    migration002,
    migration003,
    migration004,
    migration005,
    migration006,
    migration007,
    migration008,
    migration009,
    migration010,
    migration011,
    migration012,
    migration013,
    migration014,
    migration015,
  ];

  private constructor() {}

  static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager();
    }
    return DatabaseManager.instance;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

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
        dbPath = path.join(app.getPath("userData"), "digest.db");
      }

      fs.mkdirSync(path.dirname(dbPath), { recursive: true });
      this.db = new Database(dbPath);
      this.db.exec("PRAGMA journal_mode = WAL");
      this.db.exec("PRAGMA synchronous = NORMAL");
      this.db.exec("PRAGMA cache_size = 1000");
      this.db.exec("PRAGMA foreign_keys = ON");

      this.migrationRunner = new MigrationRunner(this.db);
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

  getDatabase(): Database.Database {
    if (!this.db) {
      throw new Error("Database not initialized. Call initialize() first.");
    }
    return this.db;
  }

  getMigrationStatus() {
    if (!this.migrationRunner) {
      throw new Error("Migration runner not initialized");
    }
    return this.migrationRunner.getMigrationStatus();
  }

  async rollbackMigration(version: number): Promise<void> {
    if (!this.migrationRunner) {
      throw new Error("Migration runner not initialized");
    }
    const migration = this.migrations.find((candidate) => candidate.version === version);
    if (!migration) throw new Error(`Migration ${version} not found`);
    await this.migrationRunner.rollbackMigration(version, migration);
  }

  close(): void {
    if (!this.db) return;
    this.db.close();
    this.db = null;
    this.migrationRunner = null;
    this.isInitialized = false;
    log.debug("Database connection closed", "DatabaseManager");
  }

  get initialized(): boolean {
    return this.isInitialized;
  }
}
