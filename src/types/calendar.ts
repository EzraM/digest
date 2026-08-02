export interface MeetingIdentity {
  accountId: string;
  calendarId: string;
  eventId: string;
}

export interface MeetingAction extends MeetingIdentity {
  title: string;
  startAt: number;
  provider: string;
}
