import { CalendarProjectionStore } from "./CalendarProjectionStore";
import {
  GoogleCalendarDelta,
  GoogleCalendarSummary,
  GoogleSyncTokenExpiredError,
} from "./GoogleCalendarClient";

export interface CalendarSyncClient {
  listCalendars(accountId: string): Promise<GoogleCalendarSummary[]>;
  syncEvents(
    accountId: string,
    calendarId: string,
    syncToken?: string
  ): Promise<GoogleCalendarDelta>;
}

export class GoogleCalendarSyncService {
  constructor(
    private readonly client: CalendarSyncClient,
    private readonly projection: CalendarProjectionStore
  ) {}

  async sync(accountId: string): Promise<void> {
    const calendars = await this.client.listCalendars(accountId);
    this.projection.replaceCalendars(accountId, calendars);
    for (const calendar of calendars) {
      const syncToken = this.projection.syncToken(accountId, calendar.id);
      try {
        const delta = await this.client.syncEvents(
          accountId,
          calendar.id,
          syncToken ?? undefined
        );
        this.projection.applyDelta(accountId, calendar.id, delta, !syncToken);
      } catch (error) {
        if (!(error instanceof GoogleSyncTokenExpiredError)) throw error;
        const delta = await this.client.syncEvents(accountId, calendar.id);
        this.projection.applyDelta(accountId, calendar.id, delta, true);
      }
    }
  }
}
