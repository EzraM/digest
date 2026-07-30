import Database from "better-sqlite3";
import { SqliteAssetStore } from "./SqliteAssetStore";

const createDatabase = () => {
  const database = new Database(":memory:");
  database.exec(`
    CREATE TABLE images (
      id TEXT PRIMARY KEY,
      file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      byte_length INTEGER NOT NULL,
      width INTEGER,
      height INTEGER,
      created_at INTEGER NOT NULL,
      owner_profile_id TEXT,
      document_id TEXT,
      blob BLOB NOT NULL
    )
  `);
  return database;
};

describe("SqliteAssetStore", () => {
  it("stores, addresses, opens, attaches, and releases an asset", () => {
    const database = createDatabase();
    const store = new SqliteAssetStore(database);
    const saved = store.save({
      bytes: new Uint8Array([1, 2, 3]),
      mediaType: "image/png",
      name: "sample.png",
      width: 10,
      height: 20,
    });

    expect(saved.url).toBe(`digest-image://${saved.id}`);
    expect(store.open(saved.id)).toMatchObject({
      name: "sample.png",
      mediaType: "image/png",
      byteLength: 3,
      width: 10,
      height: 20,
      documentId: null,
    });
    expect(store.attach(saved.id, "document-1")).toBe(true);
    expect(store.info(saved.id)?.documentId).toBe("document-1");
    expect(store.delete(saved.id)).toBe(true);
    expect(store.open(saved.id)).toBe(null);
    database.close();
  });

  it("rejects unsupported media", () => {
    const database = createDatabase();
    const store = new SqliteAssetStore(database);
    let message = "";
    try {
      store.save({
        bytes: new Uint8Array([1]),
        mediaType: "text/plain",
        name: "sample.txt",
      });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toContain("Unsupported asset media type");
    database.close();
  });
});
