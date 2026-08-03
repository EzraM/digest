import Database from "better-sqlite3";

export interface ScheduledJob<State = unknown> {
  id: string;
  ownerId: string;
  kind: string;
  runAt: number;
  state: State;
  attempts: number;
}

type ScheduledJobRow = {
  id: string;
  owner_id: string;
  kind: string;
  run_at: number;
  state_json: string;
  attempts: number;
};

export class ScheduledJobStore {
  constructor(private readonly db: Database.Database) {}

  put<State>(job: Omit<ScheduledJob<State>, "attempts">): void {
    const now = Date.now();
    this.db.prepare(`
      INSERT INTO scheduled_jobs
        (id, owner_id, kind, run_at, state_json, attempts, created_at, updated_at)
      VALUES
        (@id, @ownerId, @kind, @runAt, @stateJson, 0, @now, @now)
      ON CONFLICT(id) DO UPDATE SET
        owner_id = excluded.owner_id,
        kind = excluded.kind,
        run_at = excluded.run_at,
        state_json = excluded.state_json,
        attempts = 0,
        lease_expires_at = NULL,
        last_error = NULL,
        updated_at = excluded.updated_at
    `).run({ ...job, stateJson: JSON.stringify(job.state), now });
  }

  next(now = Date.now()): ScheduledJob | null {
    const row = this.db.prepare(`
      SELECT id, owner_id, kind, run_at, state_json, attempts
      FROM scheduled_jobs
      WHERE lease_expires_at IS NULL OR lease_expires_at <= ?
      ORDER BY run_at ASC
      LIMIT 1
    `).get(now) as ScheduledJobRow | undefined;
    return row ? this.fromRow(row) : null;
  }

  nextRunAt(now = Date.now()): number | null {
    const row = this.db.prepare(`
      SELECT MIN(
        CASE
          WHEN lease_expires_at IS NOT NULL AND lease_expires_at > @now
            THEN lease_expires_at
          ELSE run_at
        END
      ) AS run_at
      FROM scheduled_jobs
    `).get({ now }) as { run_at: number | null };
    return row.run_at;
  }

  claimNextDue(now: number, leaseMs: number): ScheduledJob | null {
    return this.db.transaction(() => {
      const row = this.db.prepare(`
        SELECT id, owner_id, kind, run_at, state_json, attempts
        FROM scheduled_jobs
        WHERE run_at <= ?
          AND (lease_expires_at IS NULL OR lease_expires_at <= ?)
        ORDER BY run_at ASC
        LIMIT 1
      `).get(now, now) as ScheduledJobRow | undefined;
      if (!row) return null;
      const leaseExpiresAt = now + leaseMs;
      this.db.prepare(`
        UPDATE scheduled_jobs
        SET lease_expires_at = ?, updated_at = ?
        WHERE id = ?
      `).run(leaseExpiresAt, now, row.id);
      return this.fromRow(row);
    })();
  }

  complete(id: string): void {
    this.db.prepare("DELETE FROM scheduled_jobs WHERE id = ?").run(id);
  }

  reschedule(id: string, runAt: number, state: unknown): void {
    this.db.prepare(`
      UPDATE scheduled_jobs
      SET run_at = ?, state_json = ?, attempts = 0,
          lease_expires_at = NULL, last_error = NULL, updated_at = ?
      WHERE id = ?
    `).run(runAt, JSON.stringify(state), Date.now(), id);
  }

  fail(id: string, runAt: number, error: unknown): void {
    this.db.prepare(`
      UPDATE scheduled_jobs
      SET run_at = ?, attempts = attempts + 1,
          lease_expires_at = NULL, last_error = ?, updated_at = ?
      WHERE id = ?
    `).run(runAt, String(error), Date.now(), id);
  }

  removeOwner(ownerId: string): void {
    this.db.prepare("DELETE FROM scheduled_jobs WHERE owner_id = ?").run(ownerId);
  }

  private fromRow(row: ScheduledJobRow): ScheduledJob {
    return {
      id: row.id,
      ownerId: row.owner_id,
      kind: row.kind,
      runAt: row.run_at,
      state: JSON.parse(row.state_json),
      attempts: row.attempts,
    };
  }
}
