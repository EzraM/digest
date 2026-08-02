import Database from "better-sqlite3";
import { Migration } from "../Migration.interface";

const migration: Migration = {
  version: 14,
  name: "add_join_delivery_state",
  description: "Tracks one-time delivery of scheduled meeting actions",
  async up(db: Database.Database): Promise<void> {
    db.exec("ALTER TABLE calendar_events ADD COLUMN join_notified_at INTEGER");
  },
  async down(): Promise<void> {
    // SQLite cannot remove a column without rebuilding the table.
  },
};

export default migration;
