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
import { GoogleCalendarModule } from "./google-calendar/GoogleCalendarModule";

describe("GoogleCalendarModule", () => {
  it("declares dependencies and contributes integration and typed IPC behavior", async () => {
    const container = new Container();
    const database = new Database(":memory:");
    database.exec(`
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
    container.registerInstance(
      SERVICE_IDS.DATABASE,
      database,
      { version: "1.0.0" }
    );
    container.registerInstance(
      SERVICE_IDS.SCHEDULER,
      { schedule: () => undefined, removeOwner: () => undefined },
      { version: "1.0.0" }
    );
    container.registerInstance(
      GOOGLE_AUTHORIZATION_SERVICE.name,
      provider,
      { version: GOOGLE_AUTHORIZATION_SERVICE.version }
    );
    const host = new ProcessModuleHost(container);
    host.register(new GoogleCalendarModule(async () => undefined));

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
