import Database from "better-sqlite3";
import { Migration } from "../Migration.interface";

const migration: Migration = {
  version: 13,
  name: "add_calendar_projection",
  description: "Adds local Google calendar and event projections",
  async up(db: Database.Database): Promise<void> {
    db.exec(`
      CREATE TABLE integration_calendars (
        account_id TEXT NOT NULL,
        calendar_id TEXT NOT NULL,
        summary TEXT NOT NULL,
        time_zone TEXT,
        is_primary INTEGER NOT NULL DEFAULT 0,
        sync_token TEXT,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY(account_id, calendar_id),
        FOREIGN KEY(account_id) REFERENCES integration_accounts(id) ON DELETE CASCADE
      );

      CREATE TABLE calendar_events (
        account_id TEXT NOT NULL,
        calendar_id TEXT NOT NULL,
        event_id TEXT NOT NULL,
        status TEXT NOT NULL,
        title TEXT NOT NULL,
        start_at INTEGER,
        end_at INTEGER,
        all_day INTEGER NOT NULL DEFAULT 0,
        html_link TEXT,
        conference_links_json TEXT NOT NULL DEFAULT '[]',
        provider_updated_at INTEGER,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY(account_id, calendar_id, event_id),
        FOREIGN KEY(account_id, calendar_id)
          REFERENCES integration_calendars(account_id, calendar_id)
          ON DELETE CASCADE
      );

      CREATE INDEX calendar_events_upcoming_idx
        ON calendar_events(start_at, end_at, status);
    `);
  },
  async down(db: Database.Database): Promise<void> {
    db.exec("DROP TABLE IF EXISTS calendar_events");
    db.exec("DROP TABLE IF EXISTS integration_calendars");
  },
};

export default migration;
