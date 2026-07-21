import type Database from "better-sqlite3";
import { LivePageCacheTelemetry } from "./LivePageCacheTelemetry";

describe("LivePageCacheTelemetry", () => {
  it("stores hashes and coarse URL shape without storing complete URLs", () => {
    let values: unknown[] = [];
    const database = {
      prepare: () => ({
        run: (...args: unknown[]) => {
          values = args;
        },
      }),
    } as unknown as Database.Database;
    const telemetry = new LivePageCacheTelemetry(database);
    const requestedUrl =
      "https://example.test/private/path?token=secret#document-state";

    telemetry.record({
      profileId: "private-profile-id",
      referenceKind: "ephemeral-url",
      requestedUrl,
      outcome: "hit_current",
      candidateCount: 1,
      cacheSize: 2,
      detachedCount: 1,
      reusedJourney: true,
      loadAvoided: true,
    });

    expect(values[4]).toBe("hit_current");
    expect(values[6]).toBe("exact");
    expect(values[12]).toBe(1);
    expect(values[15]).toBe("example.test");
    expect(values[16]).toBe(1);
    expect(values[17]).toBe(1);
    expect(values[18]).toBe(1);
    expect(JSON.stringify(values)).not.toContain(requestedUrl);
    expect(JSON.stringify(values)).not.toContain("token=secret");
    expect(JSON.stringify(values)).not.toContain("private-profile-id");
  });
});
