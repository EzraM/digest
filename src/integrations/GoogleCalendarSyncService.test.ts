import Database from "better-sqlite3";
import { CalendarProjectionStore } from "./google-calendar/CalendarProjectionStore";
import {
  GoogleCalendarSummary,
  GoogleSyncTokenExpiredError,
} from "./google-calendar/GoogleCalendarClient";
import {
  CalendarSyncClient,
  GoogleCalendarSyncService,
} from "./google-calendar/GoogleCalendarSyncService";

const createProjection = () => {
  const database = new Database(":memory:");
  database.exec(`
    CREATE TABLE integration_accounts (id TEXT PRIMARY KEY);
    INSERT INTO integration_accounts (id) VALUES ('account-1');
    CREATE TABLE integration_calendars (
      account_id TEXT NOT NULL,
      calendar_id TEXT NOT NULL,
      summary TEXT NOT NULL,
      time_zone TEXT,
      is_primary INTEGER NOT NULL DEFAULT 0,
      sync_token TEXT,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY(account_id, calendar_id)
    );
    CREATE TABLE calendar_events (
      account_id TEXT NOT NULL,
      calendar_id TEXT NOT NULL,
      event_id TEXT NOT NULL,
      status TEXT NOT NULL,
      title TEXT NOT NULL,
      start_at INTEGER,
      end_at INTEGER,
      all_day INTEGER NOT NULL DEFAULT 0,
      html_link TEXT,
      conference_links_json TEXT NOT NULL DEFAULT '[]',
      provider_updated_at INTEGER,
      join_notified_at INTEGER,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY(account_id, calendar_id, event_id)
    );
  `);
  return {
    database,
    projection: new CalendarProjectionStore(database, () => 1_000),
  };
};

const calendar: GoogleCalendarSummary = {
  id: "primary@example.test",
  summary: "Calendar",
  primary: true,
};

describe("GoogleCalendarSyncService", () => {
  it("projects an initial event then applies an incremental deletion", async () => {
    const { database, projection } = createProjection();
    const seenTokens: Array<string | undefined> = [];
    let call = 0;
    const client: CalendarSyncClient = {
      listCalendars: async () => [calendar],
      syncEvents: async (_accountId, _calendarId, syncToken) => {
        seenTokens.push(syncToken);
        call += 1;
        return call === 1
          ? {
              syncToken: "sync-1",
              events: [
                {
                  id: "event-1",
                  summary: "Standup",
                  start: { dateTime: "2026-08-03T14:00:00Z" },
                  end: { dateTime: "2026-08-03T14:30:00Z" },
                  hangoutLink: "https://meet.google.com/abc-defg-hij",
                },
              ],
            }
          : {
              syncToken: "sync-2",
              events: [{ id: "event-1", status: "cancelled" }],
            };
      },
    };
    const service = new GoogleCalendarSyncService(client, projection);

    await service.sync("account-1");
    const projected = projection.upcoming(0, Date.parse("2027-01-01T00:00:00Z"));
    expect(projected.length).toBe(1);
    expect(projected[0].conferenceLinks[0]).toMatchObject({
      provider: "google-meet",
      url: "https://meet.google.com/abc-defg-hij",
    });
    await service.sync("account-1");
    expect(seenTokens).toEqual([undefined, "sync-1"]);
    expect(projection.upcoming(0, Date.parse("2027-01-01T00:00:00Z"))).toEqual([]);
    expect(projection.syncToken("account-1", calendar.id)).toBe("sync-2");
    database.close();
  });

  it("rebuilds a calendar projection when its sync token expires", async () => {
    const { database, projection } = createProjection();
    projection.replaceCalendars("account-1", [calendar]);
    projection.applyDelta(
      "account-1",
      calendar.id,
      { syncToken: "expired", events: [] },
      true
    );
    const calls: Array<string | undefined> = [];
    const client: CalendarSyncClient = {
      listCalendars: async () => [calendar],
      syncEvents: async (_accountId, _calendarId, token) => {
        calls.push(token);
        if (token) throw new GoogleSyncTokenExpiredError();
        return { syncToken: "fresh", events: [] };
      },
    };

    await new GoogleCalendarSyncService(client, projection).sync("account-1");
    expect(calls).toEqual(["expired", undefined]);
    expect(projection.syncToken("account-1", calendar.id)).toBe("fresh");
    database.close();
  });
});
