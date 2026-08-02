import Database from "better-sqlite3";

export interface SecretEncryption {
  encrypt(value: string): Promise<Buffer>;
  decrypt(value: Buffer): Promise<string>;
}

export interface CredentialStore {
  read(key: string): Promise<string | null>;
  write(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export class SqliteCredentialStore implements CredentialStore {
  constructor(
    private readonly database: Database.Database,
    private readonly encryption: SecretEncryption,
    private readonly now: () => number = () => Date.now()
  ) {}

  async read(key: string): Promise<string | null> {
    const row = this.database
      .prepare("SELECT encrypted_value FROM integration_credentials WHERE key = ?")
      .get(key) as { encrypted_value: Buffer } | undefined;
    return row ? this.encryption.decrypt(row.encrypted_value) : null;
  }

  async write(key: string, value: string): Promise<void> {
    const encryptedValue = await this.encryption.encrypt(value);
    const now = this.now();
    this.database.prepare(`
      INSERT INTO integration_credentials
        (key, encrypted_value, created_at, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        encrypted_value = excluded.encrypted_value,
        updated_at = excluded.updated_at
    `).run(key, encryptedValue, now, now);
  }

  async remove(key: string): Promise<void> {
    this.database
      .prepare("DELETE FROM integration_credentials WHERE key = ?")
      .run(key);
  }
}
