import Database from "better-sqlite3";
import { extractConferenceLinks } from "./extractConferenceLinks";
import {
  GoogleCalendarDelta,
  GoogleCalendarEvent,
  GoogleCalendarSummary,
} from "./GoogleCalendarClient";

export interface ProjectedCalendarEvent {
  accountId: string;
  calendarId: string;
  eventId: string;
  title: string;
  startAt: number | null;
  endAt: number | null;
  allDay: boolean;
  htmlLink: string | null;
  conferenceLinks: ReturnType<typeof extractConferenceLinks>;
}

const eventTime = (value?: { date?: string; dateTime?: string }): number | null => {
  const source = value?.dateTime ?? (value?.date ? `${value.date}T00:00:00Z` : undefined);
  if (!source) return null;
  const parsed = Date.parse(source);
  return Number.isFinite(parsed) ? parsed : null;
};

export class CalendarProjectionStore {
  constructor(
    private readonly database: Database.Database,
    private readonly now: () => number = () => Date.now()
  ) {}

  replaceCalendars(accountId: string, calendars: GoogleCalendarSummary[]): void {
    this.database.transaction(() => {
      const keep = new Set(calendars.map((calendar) => calendar.id));
      const existing = this.database
        .prepare("SELECT calendar_id FROM integration_calendars WHERE account_id = ?")
        .all(accountId) as Array<{ calendar_id: string }>;
      for (const row of existing) {
        if (!keep.has(row.calendar_id)) {
          this.database
            .prepare("DELETE FROM integration_calendars WHERE account_id = ? AND calendar_id = ?")
            .run(accountId, row.calendar_id);
        }
      }
      const upsert = this.database.prepare(`
        INSERT INTO integration_calendars
          (account_id, calendar_id, summary, time_zone, is_primary, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(account_id, calendar_id) DO UPDATE SET
          summary = excluded.summary,
          time_zone = excluded.time_zone,
          is_primary = excluded.is_primary,
          updated_at = excluded.updated_at
      `);
      const now = this.now();
      for (const calendar of calendars) {
        upsert.run(
          accountId,
          calendar.id,
          calendar.summary,
          calendar.timeZone ?? null,
          calendar.primary ? 1 : 0,
          now
        );
      }
    })();
  }

  syncToken(accountId: string, calendarId: string): string | null {
    const row = this.database.prepare(`
      SELECT sync_token FROM integration_calendars
      WHERE account_id = ? AND calendar_id = ?
    `).get(accountId, calendarId) as { sync_token: string | null } | undefined;
    return row?.sync_token ?? null;
  }

  applyDelta(
    accountId: string,
    calendarId: string,
    delta: GoogleCalendarDelta,
    replace: boolean
  ): void {
    this.database.transaction(() => {
      if (replace) {
        this.database
          .prepare("DELETE FROM calendar_events WHERE account_id = ? AND calendar_id = ?")
          .run(accountId, calendarId);
      }
      const remove = this.database.prepare(`
        DELETE FROM calendar_events
        WHERE account_id = ? AND calendar_id = ? AND event_id = ?
      `);
      const upsert = this.database.prepare(`
        INSERT INTO calendar_events
          (account_id, calendar_id, event_id, status, title, start_at, end_at,
           all_day, html_link, conference_links_json, provider_updated_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(account_id, calendar_id, event_id) DO UPDATE SET
          status = excluded.status,
          title = excluded.title,
          start_at = excluded.start_at,
          end_at = excluded.end_at,
          all_day = excluded.all_day,
          html_link = excluded.html_link,
          conference_links_json = excluded.conference_links_json,
          provider_updated_at = excluded.provider_updated_at,
          updated_at = excluded.updated_at
      `);
      const now = this.now();
      for (const event of delta.events) {
        if (event.status === "cancelled") {
          remove.run(accountId, calendarId, event.id);
          continue;
        }
        upsert.run(
          accountId,
          calendarId,
          event.id,
          event.status ?? "confirmed",
          event.summary ?? "Untitled event",
          eventTime(event.start),
          eventTime(event.end),
          event.start?.date ? 1 : 0,
          event.htmlLink ?? null,
          JSON.stringify(extractConferenceLinks(event)),
          event.updated ? Date.parse(event.updated) : null,
          now
        );
      }
      this.database.prepare(`
        UPDATE integration_calendars
        SET sync_token = ?, updated_at = ?
        WHERE account_id = ? AND calendar_id = ?
      `).run(delta.syncToken, now, accountId, calendarId);
    })();
  }

  upcoming(from: number, to: number): ProjectedCalendarEvent[] {
    const rows = this.database.prepare(`
      SELECT account_id, calendar_id, event_id, title, start_at, end_at,
             all_day, html_link, conference_links_json
      FROM calendar_events
      WHERE status != 'cancelled' AND start_at >= ? AND start_at <= ?
      ORDER BY start_at, end_at, event_id
    `).all(from, to) as Array<{
      account_id: string;
      calendar_id: string;
      event_id: string;
      title: string;
      start_at: number | null;
      end_at: number | null;
      all_day: number;
      html_link: string | null;
      conference_links_json: string;
    }>;
    return rows.map((row) => ({
      accountId: row.account_id,
      calendarId: row.calendar_id,
      eventId: row.event_id,
      title: row.title,
      startAt: row.start_at,
      endAt: row.end_at,
      allDay: row.all_day === 1,
      htmlLink: row.html_link,
      conferenceLinks: JSON.parse(row.conference_links_json),
    }));
  }
}
