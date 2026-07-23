import Database from "better-sqlite3";
import { ProfileManager } from "./ProfileManager";

describe("ProfileManager ordering", () => {
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
      )
    `);
    return database;
  };

  it("persists a reordered profile list", () => {
    const database = createDatabase();
    const manager = new ProfileManager(database);
    const second = manager.createProfile("Second");
    const third = manager.createProfile("Third");
    const reversedIds = manager
      .listProfiles()
      .map((profile) => profile.id)
      .reverse();

    manager.reorderProfiles(reversedIds);
    manager.refreshProfiles();

    expect(manager.listProfiles().map((profile) => profile.id)).toEqual([
      third.id,
      second.id,
      "default-profile",
    ]);
    database.close();
  });

  it("rejects incomplete or duplicate orders", () => {
    const database = createDatabase();
    const manager = new ProfileManager(database);
    const second = manager.createProfile("Second");

    const getErrorMessage = (profileIds: string[]) => {
      try {
        manager.reorderProfiles(profileIds);
        return "";
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    };

    expect(getErrorMessage([second.id])).toContain("every profile exactly once");
    expect(getErrorMessage([second.id, second.id])).toContain(
      "every profile exactly once"
    );
    database.close();
  });
});
