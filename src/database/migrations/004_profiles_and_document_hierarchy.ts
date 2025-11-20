import Database from 'better-sqlite3';
import { Migration } from '../Migration.interface';
import { DEFAULT_PROFILE_ID, DEFAULT_PROFILE_NAME, getProfilePartition } from '../../config/profiles';

const migration: Migration = {
  version: 4,
  name: 'profiles_and_document_hierarchy',
  description: 'Add profiles table and document hierarchy metadata to documents',

  async up(db: Database.Database): Promise<void> {
    const execute = db.transaction(() => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS profiles (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          partition_name TEXT NOT NULL,
          icon TEXT,
          color TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          settings TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_profiles_created ON profiles(created_at);
      `);

      const now = Date.now();
      const insertProfile = db.prepare(
        `INSERT OR IGNORE INTO profiles (id, name, partition_name, icon, color, created_at, updated_at, settings)
         VALUES (?, ?, ?, NULL, NULL, ?, ?, NULL)`
      );
      insertProfile.run(
        DEFAULT_PROFILE_ID,
        DEFAULT_PROFILE_NAME,
        getProfilePartition(DEFAULT_PROFILE_ID),
        now,
        now
      );

      db.exec(`
        ALTER TABLE documents ADD COLUMN profile_id TEXT NOT NULL DEFAULT '${DEFAULT_PROFILE_ID}' REFERENCES profiles(id) ON DELETE CASCADE;
        ALTER TABLE documents ADD COLUMN parent_document_id TEXT REFERENCES documents(id) ON DELETE CASCADE;
        ALTER TABLE documents ADD COLUMN position INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE documents ADD COLUMN is_expanded INTEGER NOT NULL DEFAULT 1;
        ALTER TABLE documents ADD COLUMN deleted_at INTEGER;
      `);

      db.exec(`
        UPDATE documents
        SET profile_id = COALESCE(profile_id, '${DEFAULT_PROFILE_ID}'),
            is_expanded = COALESCE(is_expanded, 1),
            position = COALESCE(position, 0);
      `);

      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_documents_profile ON documents(profile_id);
        CREATE INDEX IF NOT EXISTS idx_documents_parent ON documents(parent_document_id);
        CREATE INDEX IF NOT EXISTS idx_documents_position ON documents(profile_id, position);
      `);
    });

    execute();
  },

  async down(): Promise<void> {
    throw new Error('Rollback not supported for profiles_and_document_hierarchy migration.');
  },
};

export default migration;
