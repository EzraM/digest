import type Database from "better-sqlite3";
import { Scheduler } from "../../scheduler/Scheduler";
import { CONTRIBUTION_POINTS } from "../../services/contributionPoints";
import { ProcessModuleDefinition } from "../../services/ProcessModule";
import { SERVICE_IDS } from "../../services/serviceIds";
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

interface GoogleCalendarRuntime {
  readonly plugin: GoogleCalendarPlugin;
  readonly meetings: MeetingJoinService;
}

const calendarDependency = {
  name: GOOGLE_CALENDAR_SERVICE.name,
  version: `^${GOOGLE_CALENDAR_SERVICE.version}`,
} as const;

export const googleCalendarModule = {
  id: "google-calendar",
  provides: [
    {
      name: GOOGLE_CALENDAR_SERVICE.name,
      definition: {
        version: GOOGLE_CALENDAR_SERVICE.version,
        dependencies: [
          {
            name: GOOGLE_AUTHORIZATION_SERVICE.name,
            version: `^${GOOGLE_AUTHORIZATION_SERVICE.version}`,
          },
          { name: SERVICE_IDS.SCHEDULER, version: "^1.0.0" },
          { name: SERVICE_IDS.DATABASE, version: "^1.0.0" },
        ],
        factory: (dependencies, context): GoogleCalendarRuntime => {
          const database = dependencies.get<Database.Database>(
            SERVICE_IDS.DATABASE
          );
          const scheduler = dependencies.get<Scheduler>(SERVICE_IDS.SCHEDULER);
          const authorization = dependencies
            .get<GoogleAuthorizationProvider>(GOOGLE_AUTHORIZATION_SERVICE.name)
            .forConsumer({
              consumerId: "google-calendar",
              scopes: [
                "https://www.googleapis.com/auth/calendar.readonly",
              ],
            });
          const projection = new CalendarProjectionStore(database);
          const meetings = new MeetingJoinService(
            projection,
            scheduler,
            (meeting) =>
              context.ipc.publish(
                "meetingReady",
                googleCalendarProtocol.events.meetingReady,
                meeting
              )
          );
          return {
            meetings,
            plugin: new GoogleCalendarPlugin(
              authorization,
              scheduler,
              new GoogleCalendarSyncService(
                new GoogleCalendarClient(authorization),
                projection
              ),
              meetings
            ),
          };
        },
      },
    },
  ],
  activates: [calendarDependency],
  contributes: [
    {
      point: CONTRIBUTION_POINTS.INTEGRATION,
      id: "google-calendar",
      dependencies: [calendarDependency],
      create: (dependencies) =>
        dependencies.get<GoogleCalendarRuntime>(GOOGLE_CALENDAR_SERVICE.name)
          .plugin,
    },
  ],
  operations: [
    {
      name: "readyMeetings",
      request: googleCalendarProtocol.requests.readyMeetings,
      dependencies: [calendarDependency],
      handle: (dependencies) => {
        const now = Date.now();
        return dependencies
          .get<GoogleCalendarRuntime>(GOOGLE_CALENDAR_SERVICE.name)
          .meetings.upcoming(now, now + 24 * 60 * 60_000);
      },
    },
    {
      name: "join",
      request: googleCalendarProtocol.requests.join,
      dependencies: [
        calendarDependency,
        { name: SERVICE_IDS.OPEN_EXTERNAL, version: "^1.0.0" },
      ],
      handle: async (dependencies, { identity }) => {
        const url = dependencies
          .get<GoogleCalendarRuntime>(GOOGLE_CALENDAR_SERVICE.name)
          .meetings.joinUrl(identity);
        if (!url) throw new Error("Meeting link is no longer available");
        await dependencies.get<(url: string) => Promise<unknown>>(
          SERVICE_IDS.OPEN_EXTERNAL
        )(url);
      },
    },
  ],
} satisfies ProcessModuleDefinition;
