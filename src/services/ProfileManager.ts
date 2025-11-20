import Database from "better-sqlite3";
import { randomUUID } from "crypto";
import {
  DEFAULT_PROFILE_ID,
  DEFAULT_PROFILE_NAME,
  getProfilePartition as deriveProfilePartition,
} from "../config/profiles";
import { ProfileRecord } from "../types/documents";
import { log } from "../utils/mainLogger";

export interface CreateProfileOptions {
  profileId?: string;
  icon?: string | null;
  color?: string | null;
  partitionName?: string;
  settings?: Record<string, unknown> | null;
}

export class ProfileManager {
  private profiles = new Map<string, ProfileRecord>();

  constructor(private database: Database.Database) {
    this.loadProfilesFromDatabase();
    this.ensureDefaultProfile();
  }

  /** Reload profiles from the database into the in-memory cache */
  refreshProfiles(): void {
    this.loadProfilesFromDatabase();
  }

  listProfiles(): ProfileRecord[] {
    return Array.from(this.profiles.values());
  }

  getProfile(profileId: string): ProfileRecord {
    const profile = this.profiles.get(profileId);
    if (!profile) {
      throw new Error(`Profile not found: ${profileId}`);
    }
    return profile;
  }

  getProfilePartition(profileId: string): string {
    return this.getProfile(profileId).partitionName;
  }

  createProfile(name: string, options: CreateProfileOptions = {}): ProfileRecord {
    const id = options.profileId ?? randomUUID();
    const partitionName = options.partitionName ?? deriveProfilePartition(id);
    const now = Date.now();
    const settingsString = options.settings ? JSON.stringify(options.settings) : null;

    const stmt = this.database.prepare(
      `INSERT INTO profiles (id, name, partition_name, icon, color, created_at, updated_at, settings)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );

    stmt.run(
      id,
      name,
      partitionName,
      options.icon ?? null,
      options.color ?? null,
      now,
      now,
      settingsString
    );

    const profile: ProfileRecord = {
      id,
      name,
      partitionName,
      icon: options.icon ?? null,
      color: options.color ?? null,
      createdAt: now,
      updatedAt: now,
      settings: options.settings ?? null,
    };

    this.profiles.set(id, profile);
    log.debug(`Created profile ${id} (${name})`, "ProfileManager");
    return profile;
  }

  deleteProfile(profileId: string): void {
    if (profileId === DEFAULT_PROFILE_ID) {
      throw new Error("Cannot delete default profile");
    }

    const stmt = this.database.prepare(`DELETE FROM profiles WHERE id = ?`);
    stmt.run(profileId);
    this.profiles.delete(profileId);
    log.debug(`Deleted profile ${profileId}`, "ProfileManager");
  }

  private ensureDefaultProfile(): void {
    if (this.profiles.has(DEFAULT_PROFILE_ID)) {
      return;
    }

    log.debug("Default profile missing - creating", "ProfileManager");
    this.createProfile(DEFAULT_PROFILE_NAME, { profileId: DEFAULT_PROFILE_ID });
  }

  private loadProfilesFromDatabase(): void {
    try {
      const rows = this.database
        .prepare(
          `SELECT id, name, partition_name, icon, color, created_at, updated_at, settings FROM profiles ORDER BY created_at ASC`
        )
        .all();

      this.profiles.clear();
      for (const row of rows) {
        this.profiles.set(row.id, this.mapProfileRow(row));
      }
    } catch (error) {
      log.debug(`Failed to load profiles: ${error}`, "ProfileManager");
      throw error;
    }
  }

  private mapProfileRow(row: any): ProfileRecord {
    let parsedSettings: Record<string, unknown> | null = null;
    if (row.settings) {
      try {
        parsedSettings = JSON.parse(row.settings);
      } catch (error) {
        log.debug(`Failed to parse profile settings for ${row.id}: ${error}`, "ProfileManager");
      }
    }

    return {
      id: row.id,
      name: row.name,
      partitionName: row.partition_name,
      icon: row.icon ?? null,
      color: row.color ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      settings: parsedSettings,
    };
  }
}
