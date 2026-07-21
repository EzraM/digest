import Database from "better-sqlite3";
import { Migration } from "../Migration.interface";

const migration: Migration = {
  version: 8,
  name: "add_live_page_cache_attempts",
  description: "Record privacy-conscious live page cache outcomes",

  async up(db: Database.Database): Promise<void> {
    db.exec(`
      CREATE TABLE IF NOT EXISTS live_page_cache_attempts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        session_id TEXT NOT NULL,
        profile_hash TEXT NOT NULL,
        reference_kind TEXT NOT NULL,
        outcome TEXT NOT NULL,
        miss_reason TEXT,
        match_class TEXT NOT NULL,
        candidate_count INTEGER NOT NULL,
        cache_size INTEGER NOT NULL,
        detached_count INTEGER NOT NULL,
        association_age_ms INTEGER,
        reused_journey INTEGER NOT NULL,
        load_avoided INTEGER NOT NULL,
        requested_url_hash TEXT NOT NULL,
        normalized_url_hash TEXT NOT NULL,
        hostname TEXT,
        has_query INTEGER NOT NULL,
        query_key_count INTEGER NOT NULL,
        has_fragment INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_live_page_cache_attempts_timestamp
        ON live_page_cache_attempts(timestamp);
      CREATE INDEX IF NOT EXISTS idx_live_page_cache_attempts_outcome
        ON live_page_cache_attempts(outcome, miss_reason);
    `);
  },

  async down(db: Database.Database): Promise<void> {
    db.exec(`
      DROP INDEX IF EXISTS idx_live_page_cache_attempts_outcome;
      DROP INDEX IF EXISTS idx_live_page_cache_attempts_timestamp;
      DROP TABLE IF EXISTS live_page_cache_attempts;
    `);
  },
};

export default migration;
