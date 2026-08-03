import { CalendarProjectionStore } from "./google-calendar/CalendarProjectionStore";
import { MeetingJoinService } from "./google-calendar/MeetingJoinService";
import Database from "better-sqlite3";
import { ScheduledJob } from "../scheduler/ScheduledJobStore";

const createProjection = () => {
  const database = new Database(":memory:");
  database.exec(`
    CREATE TABLE integration_calendars (
      account_id TEXT NOT NULL, calendar_id TEXT NOT NULL, summary TEXT NOT NULL,
      time_zone TEXT, is_primary INTEGER NOT NULL DEFAULT 0, sync_token TEXT,
      updated_at INTEGER NOT NULL, PRIMARY KEY(account_id, calendar_id)
    );
    CREATE TABLE calendar_events (
      account_id TEXT NOT NULL, calendar_id TEXT NOT NULL, event_id TEXT NOT NULL,
      status TEXT NOT NULL, title TEXT NOT NULL, start_at INTEGER, end_at INTEGER,
      all_day INTEGER NOT NULL DEFAULT 0, html_link TEXT,
      conference_links_json TEXT NOT NULL DEFAULT '[]', provider_updated_at INTEGER,
      join_notified_at INTEGER, updated_at INTEGER NOT NULL,
      PRIMARY KEY(account_id, calendar_id, event_id)
    );
  `);
  return { database, projection: new CalendarProjectionStore(database, () => 1_000) };
};

describe("MeetingJoinService", () => {
  it("schedules, publishes, and marks a meeting action once", async () => {
    const { database, projection } = createProjection();
    projection.replaceCalendars("account", [
      { id: "calendar", summary: "Calendar", primary: true },
    ]);
    projection.applyDelta(
      "account",
      "calendar",
      {
        syncToken: "sync",
        events: [
          {
            id: "event",
            summary: "Planning",
            start: { dateTime: new Date(601_000).toISOString() },
            end: { dateTime: new Date(901_000).toISOString() },
            hangoutLink: "https://meet.google.com/abc-defg-hij",
          },
        ],
      },
      true
    );
    const jobs: Array<Omit<ScheduledJob<unknown>, "attempts">> = [];
    const actions: unknown[] = [];
    const service = new MeetingJoinService(
      projection,
      {
        schedule: <State>(job: Omit<ScheduledJob<State>, "attempts">) =>
          jobs.push(job as Omit<ScheduledJob<unknown>, "attempts">),
      },
      (action) => {
        actions.push(action);
        return true;
      },
      () => 1_000
    );

    service.reconcile("account");
    expect(jobs[0]).toMatchObject({
      kind: "google-calendar.join-ready",
      runAt: 301_000,
    });
    await service.jobHandlers[0].run({ ...jobs[0], attempts: 0 } as ScheduledJob<{
      accountId: string;
      calendarId: string;
      eventId: string;
    }>);
    expect(actions[0]).toMatchObject({ title: "Planning", provider: "google-meet" });
    expect(
      service.joinUrl({ accountId: "account", calendarId: "calendar", eventId: "event" })
    ).toBe("https://meet.google.com/abc-defg-hij");
    jobs.length = 0;
    service.reconcile("account");
    expect(jobs).toEqual([]);
    database.close();
  });

  it("keeps the durable job pending when no renderer can receive it", async () => {
    const { database, projection } = createProjection();
    projection.replaceCalendars("account", [
      { id: "calendar", summary: "Calendar", primary: true },
    ]);
    projection.applyDelta(
      "account",
      "calendar",
      {
        syncToken: "sync",
        events: [{
          id: "event",
          summary: "Planning",
          start: { dateTime: new Date(601_000).toISOString() },
          end: { dateTime: new Date(901_000).toISOString() },
          hangoutLink: "https://meet.google.com/abc-defg-hij",
        }],
      },
      true
    );
    const jobs: Array<Omit<ScheduledJob<unknown>, "attempts">> = [];
    const service = new MeetingJoinService(
      projection,
      {
        schedule: <State>(job: Omit<ScheduledJob<State>, "attempts">) =>
          jobs.push(job as Omit<ScheduledJob<unknown>, "attempts">),
      },
      () => false,
      () => 1_000
    );
    service.reconcile("account");

    const result = await service.jobHandlers[0].run({
      ...jobs[0],
      attempts: 0,
    } as ScheduledJob<{
      accountId: string;
      calendarId: string;
      eventId: string;
    }>);
    expect(result).toEqual({ runAt: 61_000, state: jobs[0].state });
    jobs.length = 0;
    service.reconcile("account");
    expect(jobs.length).toBe(1);
    database.close();
  });
});
