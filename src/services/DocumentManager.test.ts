import Database from "better-sqlite3";
import { DocumentManager } from "./DocumentManager";
import { ProfileManager } from "./ProfileManager";

const createDatabase = () => {
  const database = new Database(":memory:");
  database.exec(`
    CREATE TABLE profiles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      partition_name TEXT NOT NULL,
      icon TEXT,
      color TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      settings TEXT,
      position INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE documents (
      id TEXT PRIMARY KEY,
      title TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      block_count INTEGER DEFAULT 0,
      profile_id TEXT,
      parent_document_id TEXT,
      position INTEGER DEFAULT 0,
      is_expanded INTEGER DEFAULT 1,
      deleted_at INTEGER
    );
  `);
  return database;
};

describe("DocumentManager deletion", () => {
  it("returns the first remaining page as an explicit replacement", async () => {
    const database = createDatabase();
    const profiles = new ProfileManager(database);
    const documents = new DocumentManager(database, profiles);
    const current = documents.activeDocument;
    if (!current) throw new Error("Expected a default document");
    const replacement = documents.createDocument(
      current.profileId,
      "Replacement"
    );

    const result = await documents.deleteDocument(current.id);

    expect(result).toEqual({
      status: "deleted",
      documentId: current.id,
      profileId: current.profileId,
      replacementDocumentId: replacement.id,
    });
    expect(documents.activeDocument?.id).toBe(replacement.id);
    database.close();
  });
});
