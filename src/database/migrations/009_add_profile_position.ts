import Database from "better-sqlite3";
import { Migration } from "../Migration.interface";

const migration: Migration = {
  version: 9,
  name: "add_profile_position",
  description: "Persist user-defined profile ordering",

  async up(db: Database.Database): Promise<void> {
    db.exec(`
      ALTER TABLE profiles ADD COLUMN position INTEGER NOT NULL DEFAULT 0;

      UPDATE profiles
      SET position = (
        SELECT COUNT(*)
        FROM profiles AS earlier
        WHERE earlier.created_at < profiles.created_at
           OR (
             earlier.created_at = profiles.created_at
             AND earlier.id < profiles.id
           )
      );

      CREATE INDEX IF NOT EXISTS idx_profiles_position
        ON profiles(position);
    `);
  },

  async down(): Promise<void> {
    throw new Error("Rollback not supported for profile position migration.");
  },
};

export default migration;
