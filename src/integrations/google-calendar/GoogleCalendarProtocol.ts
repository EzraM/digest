import {
  emptyShape,
  ModuleProtocolDefinition,
  RequestShape,
  shape,
  Shape,
  voidShape,
} from "../../services/ModuleProtocol";
import { MeetingAction, MeetingIdentity } from "../../types/calendar";

const stringField = (
  value: unknown,
  field: string
): string => {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Expected ${field} to be a non-empty string`);
  }
  return value;
};

const meetingIdentityShape = shape<MeetingIdentity>((value) => {
  if (!value || typeof value !== "object") {
    throw new Error("Expected a meeting identity");
  }
  const candidate = value as Partial<MeetingIdentity>;
  return {
    accountId: stringField(candidate.accountId, "accountId"),
    calendarId: stringField(candidate.calendarId, "calendarId"),
    eventId: stringField(candidate.eventId, "eventId"),
  };
});

const meetingActionShape = shape<MeetingAction>((value) => {
  const identity = meetingIdentityShape.parse(value);
  const candidate = value as Partial<MeetingAction>;
  if (typeof candidate.startAt !== "number" || !Number.isFinite(candidate.startAt)) {
    throw new Error("Expected startAt to be a finite number");
  }
  return {
    ...identity,
    title: stringField(candidate.title, "title"),
    startAt: candidate.startAt,
    provider: stringField(candidate.provider, "provider"),
  };
});

const meetingActionsShape = shape<MeetingAction[]>((value) => {
  if (!Array.isArray(value)) throw new Error("Expected meeting actions");
  return value.map((action) => meetingActionShape.parse(action));
});

const joinRequestShape = shape<{ identity: MeetingIdentity }>((value) => {
  if (!value || typeof value !== "object") {
    throw new Error("Expected a join request");
  }
  return {
    identity: meetingIdentityShape.parse(
      (value as { identity?: unknown }).identity
    ),
  };
});

export interface CalendarNotificationPreference {
  accountId: string;
  calendarId: string;
  summary: string;
  primary: boolean;
  notificationsEnabled: boolean;
}

const booleanField = (value: unknown, field: string): boolean => {
  if (typeof value !== "boolean") throw new Error(`Expected ${field} to be a boolean`);
  return value;
};

const calendarPreferenceShape = shape<CalendarNotificationPreference>((value) => {
  if (!value || typeof value !== "object") throw new Error("Expected a calendar preference");
  const candidate = value as Partial<CalendarNotificationPreference>;
  return {
    accountId: stringField(candidate.accountId, "accountId"),
    calendarId: stringField(candidate.calendarId, "calendarId"),
    summary: stringField(candidate.summary, "summary"),
    primary: booleanField(candidate.primary, "primary"),
    notificationsEnabled: booleanField(
      candidate.notificationsEnabled,
      "notificationsEnabled"
    ),
  };
});

const calendarPreferencesShape = shape<CalendarNotificationPreference[]>((value) => {
  if (!Array.isArray(value)) throw new Error("Expected calendar preferences");
  return value.map((preference) => calendarPreferenceShape.parse(preference));
});

const setCalendarNotificationsShape = shape<{
  accountId: string;
  calendarId: string;
  enabled: boolean;
}>((value) => {
  if (!value || typeof value !== "object") throw new Error("Expected a calendar selection");
  const candidate = value as { accountId?: unknown; calendarId?: unknown; enabled?: unknown };
  return {
    accountId: stringField(candidate.accountId, "accountId"),
    calendarId: stringField(candidate.calendarId, "calendarId"),
    enabled: booleanField(candidate.enabled, "enabled"),
  };
});

export const googleCalendarProtocol = {
  requests: {
    readyMeetings: {
      input: emptyShape,
      output: meetingActionsShape,
    },
    listNotificationCalendars: {
      input: emptyShape,
      output: calendarPreferencesShape,
    },
    setCalendarNotifications: {
      input: setCalendarNotificationsShape,
      output: voidShape,
    },
    join: {
      input: joinRequestShape,
      output: voidShape,
    },
  },
  events: {
    meetingReady: meetingActionShape,
    calendarPreferencesChanged: emptyShape,
  },
} satisfies ModuleProtocolDefinition<
  Record<string, RequestShape<unknown, unknown>>,
  Record<string, Shape<unknown>>
>;

export type GoogleCalendarProtocol = typeof googleCalendarProtocol;
