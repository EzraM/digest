import { CredentialStore } from "../CredentialStore";
import { IntegrationAccountStore } from "../IntegrationAccountStore";
import { GoogleCalendarEventLike } from "./extractConferenceLinks";

type Fetch = typeof fetch;

export interface GoogleCalendarSummary {
  id: string;
  summary: string;
  timeZone?: string;
  primary: boolean;
}

export interface GoogleCalendarEvent extends GoogleCalendarEventLike {
  id: string;
  status?: string;
  summary?: string;
  htmlLink?: string;
  updated?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
}

export interface GoogleCalendarDelta {
  events: GoogleCalendarEvent[];
  syncToken: string;
}

export class GoogleSyncTokenExpiredError extends Error {}

export class GoogleAccessTokenProvider {
  private readonly cache = new Map<string, { token: string; expiresAt: number }>();

  constructor(
    private readonly clientId: string,
    private readonly accounts: IntegrationAccountStore,
    private readonly credentials: CredentialStore,
    private readonly fetcher: Fetch = fetch,
    private readonly now: () => number = () => Date.now()
  ) {}

  async accessToken(accountId: string): Promise<string> {
    const cached = this.cache.get(accountId);
    if (cached && cached.expiresAt - 60_000 > this.now()) return cached.token;
    const account = this.accounts.get(accountId);
    if (!account) throw new Error(`Unknown integration account: ${accountId}`);
    const refreshToken = await this.credentials.read(account.credentialKey);
    if (!refreshToken) throw new Error(`Missing credential for account: ${accountId}`);
    const response = await this.fetcher("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.clientId,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });
    if (!response.ok) throw new Error(`Google token refresh failed (${response.status})`);
    const result = (await response.json()) as {
      access_token: string;
      expires_in: number;
    };
    this.cache.set(accountId, {
      token: result.access_token,
      expiresAt: this.now() + result.expires_in * 1_000,
    });
    return result.access_token;
  }

  forget(accountId: string): void {
    this.cache.delete(accountId);
  }
}

export class GoogleCalendarClient {
  constructor(
    private readonly tokens: GoogleAccessTokenProvider,
    private readonly fetcher: Fetch = fetch,
    private readonly now: () => number = () => Date.now()
  ) {}

  async listCalendars(accountId: string): Promise<GoogleCalendarSummary[]> {
    const calendars: GoogleCalendarSummary[] = [];
    let pageToken: string | undefined;
    do {
      const url = new URL("https://www.googleapis.com/calendar/v3/users/me/calendarList");
      if (pageToken) url.searchParams.set("pageToken", pageToken);
      const response = await this.request(accountId, url);
      const page = (await response.json()) as {
        items?: Array<{
          id: string;
          summary?: string;
          timeZone?: string;
          primary?: boolean;
          deleted?: boolean;
        }>;
        nextPageToken?: string;
      };
      for (const item of page.items ?? []) {
        if (!item.deleted) {
          calendars.push({
            id: item.id,
            summary: item.summary ?? item.id,
            timeZone: item.timeZone,
            primary: item.primary ?? false,
          });
        }
      }
      pageToken = page.nextPageToken;
    } while (pageToken);
    return calendars;
  }

  async syncEvents(
    accountId: string,
    calendarId: string,
    syncToken?: string
  ): Promise<GoogleCalendarDelta> {
    const events: GoogleCalendarEvent[] = [];
    let pageToken: string | undefined;
    let nextSyncToken: string | undefined;
    do {
      const url = new URL(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`
      );
      url.searchParams.set("singleEvents", "true");
      url.searchParams.set("showDeleted", "true");
      url.searchParams.set("maxResults", "2500");
      if (syncToken) {
        url.searchParams.set("syncToken", syncToken);
      } else {
        url.searchParams.set("timeMin", new Date(this.now() - 24 * 60 * 60_000).toISOString());
        url.searchParams.set("timeMax", new Date(this.now() + 30 * 24 * 60 * 60_000).toISOString());
      }
      if (pageToken) url.searchParams.set("pageToken", pageToken);
      const response = await this.request(accountId, url, true);
      if (response.status === 410) throw new GoogleSyncTokenExpiredError();
      const page = (await response.json()) as {
        items?: GoogleCalendarEvent[];
        nextPageToken?: string;
        nextSyncToken?: string;
      };
      events.push(...(page.items ?? []));
      pageToken = page.nextPageToken;
      nextSyncToken = page.nextSyncToken ?? nextSyncToken;
    } while (pageToken);
    if (!nextSyncToken) throw new Error("Google Calendar did not return a sync token");
    return { events, syncToken: nextSyncToken };
  }

  private async request(
    accountId: string,
    url: URL,
    allowGone = false
  ): Promise<Response> {
    const token = await this.tokens.accessToken(accountId);
    const response = await this.fetcher(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok && !(allowGone && response.status === 410)) {
      throw new Error(`Google Calendar request failed (${response.status})`);
    }
    return response;
  }
}
