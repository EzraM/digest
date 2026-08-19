import Database from "better-sqlite3";
import { Container } from "../services/Container";
import { CONTRIBUTION_POINTS } from "../services/contributionPoints";
import { ProcessModuleHost } from "../services/ProcessModule";
import { SERVICE_IDS } from "../services/serviceIds";
import { IntegrationPlugin } from "./IntegrationPlugin";
import {
  GoogleAuthorization,
  GoogleAuthorizationProvider,
} from "./google/GoogleAuthorizationService";
import {
  GOOGLE_AUTHORIZATION_SERVICE,
} from "./google/GoogleAuthorizationModule";
import { googleCalendarModule } from "./google-calendar/GoogleCalendarModule";

describe("GoogleCalendarModule", () => {
  it("declares dependencies and contributes integration and typed IPC behavior", async () => {
    const container = new Container();
    const database = new Database(":memory:");
    database.exec(`
      CREATE TABLE integration_calendars (
        account_id TEXT NOT NULL,
        calendar_id TEXT NOT NULL,
        summary TEXT NOT NULL,
        time_zone TEXT,
        is_primary INTEGER NOT NULL DEFAULT 0,
        sync_token TEXT,
        notifications_enabled INTEGER NOT NULL DEFAULT 1,
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
    const requests: Array<{ consumerId: string; scopes: readonly string[] }> = [];
    const authorization: GoogleAuthorization = {
      accounts: () => [],
      connect: async () => {
        throw new Error("not used");
      },
      accessToken: async () => "token",
      disconnect: async () => undefined,
    };
    const provider: GoogleAuthorizationProvider = {
      forConsumer: (request) => {
        requests.push(request);
        return authorization;
      },
    };
    container.register({
      name: SERVICE_IDS.DATABASE,
      version: "1.0.0",
      create: () => database,
    });
    container.register({
      name: SERVICE_IDS.SCHEDULER,
      version: "1.0.0",
      create: () => ({ schedule: () => undefined, removeOwner: () => undefined }),
    });
    container.register({
      name: GOOGLE_AUTHORIZATION_SERVICE.name,
      version: GOOGLE_AUTHORIZATION_SERVICE.version,
      create: () => provider,
    });
    container.register({
      name: SERVICE_IDS.OPEN_EXTERNAL,
      version: "1.0.0",
      create: () => async () => undefined,
    });
    const host = new ProcessModuleHost(container);
    host.register(googleCalendarModule);

    await host.activate();

    expect(requests).toEqual([
      {
        consumerId: "google-calendar",
        scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
      },
    ]);
    expect(
      host.contributions.list<IntegrationPlugin>(
        CONTRIBUTION_POINTS.INTEGRATION
      )[0].manifest.id
    ).toBe("google-calendar");
    expect(
      await host.moduleIPC.invoke("google-calendar", "readyMeetings", {}, {
        rendererId: 7,
      })
    ).toEqual([]);
    database.close();
  });
});
