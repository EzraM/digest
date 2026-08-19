import Database from "better-sqlite3";
import { Migration } from "../Migration.interface";

const migration: Migration = {
  version: 16,
  name: "add_calendar_notification_preferences",
  description: "Selects which Google calendars may produce meeting notifications",
  async up(db: Database.Database): Promise<void> {
    db.exec(`
      ALTER TABLE integration_calendars
      ADD COLUMN notifications_enabled INTEGER NOT NULL DEFAULT 1;
    `);
  },
  async down(): Promise<void> {
    // SQLite cannot safely drop this column while calendar_events references
    // the table. Keep the additive preference when rolling back locally.
  },
};

export default migration;
