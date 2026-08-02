import type Database from "better-sqlite3";
import { CONTRIBUTION_POINTS } from "../../services/contributionPoints";
import {
  ProcessModule,
  ProcessModuleRegistrar,
} from "../../services/ProcessModule";
import { SERVICE_IDS } from "../../services/serviceIds";
import { Scheduler } from "../../scheduler/Scheduler";
import {
  GoogleAuthorizationProvider,
} from "../google/GoogleAuthorizationService";
import {
  GOOGLE_AUTHORIZATION_SERVICE,
} from "../google/GoogleAuthorizationModule";
import { CalendarProjectionStore } from "./CalendarProjectionStore";
import { GoogleCalendarClient } from "./GoogleCalendarClient";
import { GoogleCalendarPlugin } from "./GoogleCalendarPlugin";
import { GoogleCalendarSyncService } from "./GoogleCalendarSyncService";
import { MeetingJoinService } from "./MeetingJoinService";
import { googleCalendarProtocol } from "./GoogleCalendarProtocol";

export const GOOGLE_CALENDAR_SERVICE = {
  name: "google.calendar",
  version: "1.0.0",
} as const;

export class GoogleCalendarModule implements ProcessModule {
  readonly id = "google-calendar";

  constructor(
    private readonly openExternal: (url: string) => Promise<unknown>
  ) {}

  register(module: ProcessModuleRegistrar): void {
    module.provide(GOOGLE_CALENDAR_SERVICE.name, {
      version: GOOGLE_CALENDAR_SERVICE.version,
      dependencies: [
        {
          name: GOOGLE_AUTHORIZATION_SERVICE.name,
          version: `^${GOOGLE_AUTHORIZATION_SERVICE.version}`,
        },
        { name: SERVICE_IDS.SCHEDULER, version: "^1.0.0" },
        { name: SERVICE_IDS.DATABASE, version: "^1.0.0" },
      ],
      factory: (dependencies) => {
        const database = dependencies.get<Database.Database>(
          SERVICE_IDS.DATABASE
        );
        const scheduler = dependencies.get<Scheduler>(SERVICE_IDS.SCHEDULER);
        const authorization = dependencies
          .get<GoogleAuthorizationProvider>(GOOGLE_AUTHORIZATION_SERVICE.name)
          .forConsumer({
            consumerId: this.id,
            scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
          });
        const projection = new CalendarProjectionStore(database);
        const meetingActions = new MeetingJoinService(
          projection,
          scheduler,
          (meeting) =>
            module.ipc.publish(
              "meetingReady",
              googleCalendarProtocol.events.meetingReady,
              meeting
            )
        );
        const plugin = new GoogleCalendarPlugin(
          authorization,
          scheduler,
          new GoogleCalendarSyncService(
            new GoogleCalendarClient(authorization),
            projection
          ),
          meetingActions
        );
        module.contribute(
          CONTRIBUTION_POINTS.INTEGRATION,
          plugin.manifest.id,
          plugin
        );
        module.ipc.handle(
          "readyMeetings",
          googleCalendarProtocol.requests.readyMeetings,
          () => {
            const now = Date.now();
            return meetingActions.upcoming(now, now + 24 * 60 * 60_000);
          }
        );
        module.ipc.handle(
          "join",
          googleCalendarProtocol.requests.join,
          async ({ identity }) => {
            const url = meetingActions.joinUrl(identity);
            if (!url) throw new Error("Meeting link is no longer available");
            await this.openExternal(url);
          }
        );
        return plugin;
      },
    });
    module.activate(GOOGLE_CALENDAR_SERVICE.name, "^1.0.0");
  }
}
