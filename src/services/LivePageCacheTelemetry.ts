import { createHash, randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { normalizeJourneyUrl } from "./BrowsingJourneyStore";
import type { CacheMissReason } from "./LivePageOpenPolicy";

export type CacheAttemptOutcome = "hit_current" | "hit_history" | "miss";
export type CacheAttempt = {
  profileId: string;
  referenceKind: "site-block" | "ephemeral-url";
  requestedUrl: string;
  outcome: CacheAttemptOutcome;
  missReason?: CacheMissReason;
  candidateCount: number;
  cacheSize: number;
  detachedCount: number;
  reusedJourney: boolean;
  loadAvoided: boolean;
};

export class LivePageCacheTelemetry {
  private readonly sessionId = randomUUID();
  private readonly insert: Database.Statement;

  constructor(database: Database.Database) {
    this.insert = database.prepare(`
      INSERT INTO live_page_cache_attempts (
        timestamp, session_id, profile_hash, reference_kind, outcome,
        miss_reason, match_class, candidate_count, cache_size, detached_count,
        association_age_ms, reused_journey, load_avoided, requested_url_hash,
        normalized_url_hash, hostname, has_query, query_key_count, has_fragment
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
  }

  record(attempt: CacheAttempt): void {
    const normalizedUrl = normalizeJourneyUrl(attempt.requestedUrl);
    let hostname: string | null = null;
    let hasQuery = 0;
    let queryKeyCount = 0;
    let hasFragment = 0;
    try {
      const parsed = new URL(normalizedUrl);
      hostname = parsed.hostname || null;
      hasQuery = parsed.search.length > 0 ? 1 : 0;
      queryKeyCount = new Set(parsed.searchParams.keys()).size;
      hasFragment = parsed.hash.length > 0 ? 1 : 0;
    } catch {
      // Invalid URLs retain hashes but no structural URL fields.
    }

    this.insert.run(
      Date.now(),
      this.sessionId,
      hash(attempt.profileId),
      attempt.referenceKind,
      attempt.outcome,
      attempt.missReason ?? null,
      attempt.candidateCount > 0 ? "exact" : "unrelated",
      attempt.candidateCount,
      attempt.cacheSize,
      attempt.detachedCount,
      null,
      attempt.reusedJourney ? 1 : 0,
      attempt.loadAvoided ? 1 : 0,
      hash(attempt.requestedUrl),
      hash(normalizedUrl),
      hostname,
      hasQuery,
      queryKeyCount,
      hasFragment
    );
  }
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
