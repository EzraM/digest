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

export const googleCalendarProtocol = {
  requests: {
    readyMeetings: {
      input: emptyShape,
      output: meetingActionsShape,
    },
    join: {
      input: joinRequestShape,
      output: voidShape,
    },
  },
  events: {
    meetingReady: meetingActionShape,
  },
} satisfies ModuleProtocolDefinition<
  Record<string, RequestShape<unknown, unknown>>,
  Record<string, Shape<unknown>>
>;

export type GoogleCalendarProtocol = typeof googleCalendarProtocol;
