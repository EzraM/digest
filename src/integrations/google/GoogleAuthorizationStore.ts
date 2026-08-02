import Database from "better-sqlite3";

export class GoogleAuthorizationStore {
  constructor(
    private readonly database: Database.Database,
    private readonly now: () => number = () => Date.now()
  ) {}

  bind(accountId: string, consumerId: string, scopes: readonly string[]): void {
    const now = this.now();
    this.database.prepare(`
      INSERT INTO google_authorization_consumers
        (account_id, consumer_id, scopes_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(account_id, consumer_id) DO UPDATE SET
        scopes_json = excluded.scopes_json,
        updated_at = excluded.updated_at
    `).run(accountId, consumerId, JSON.stringify([...scopes].sort()), now, now);
  }

  unbind(accountId: string, consumerId: string): void {
    this.database.prepare(`
      DELETE FROM google_authorization_consumers
      WHERE account_id = ? AND consumer_id = ?
    `).run(accountId, consumerId);
  }

  scopes(accountId: string, consumerId: string): string[] | null {
    const row = this.database.prepare(`
      SELECT scopes_json FROM google_authorization_consumers
      WHERE account_id = ? AND consumer_id = ?
    `).get(accountId, consumerId) as { scopes_json: string } | undefined;
    return row ? JSON.parse(row.scopes_json) : null;
  }

  accountIds(consumerId: string): string[] {
    return (
      this.database.prepare(`
        SELECT account_id FROM google_authorization_consumers
        WHERE consumer_id = ? ORDER BY account_id
      `).all(consumerId) as Array<{ account_id: string }>
    ).map((row) => row.account_id);
  }

  consumerCount(accountId: string): number {
    const row = this.database.prepare(`
      SELECT COUNT(*) AS count FROM google_authorization_consumers
      WHERE account_id = ?
    `).get(accountId) as { count: number };
    return row.count;
  }
}
