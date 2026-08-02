import { Scheduler, JobHandler } from "../../scheduler/Scheduler";
import { MeetingAction } from "../../types/calendar";
import {
  CalendarProjectionStore,
  MeetingIdentity,
} from "./CalendarProjectionStore";

interface MeetingJobState extends MeetingIdentity {}

export class MeetingJoinService {
  readonly jobHandlers: JobHandler<MeetingJobState>[] = [
    {
      kind: "google-calendar.join-ready",
      run: async (job) => {
        const event = this.projection.meeting(job.state);
        const link = event?.conferenceLinks[0];
        if (!event || !link || event.startAt === null) return { complete: true };
        this.publish({
          accountId: event.accountId,
          calendarId: event.calendarId,
          eventId: event.eventId,
          title: event.title,
          startAt: event.startAt,
          provider: link.provider,
        });
        this.projection.markMeetingNotified(job.state, this.now());
        return { complete: true };
      },
    },
  ];

  constructor(
    private readonly projection: CalendarProjectionStore,
    private readonly scheduler: Pick<Scheduler, "schedule">,
    private readonly publish: (action: MeetingAction) => void,
    private readonly now: () => number = () => Date.now()
  ) {}

  reconcile(accountId: string): void {
    const now = this.now();
    const events = this.projection.pendingMeetingActions(
      accountId,
      now - 5 * 60_000,
      now + 30 * 24 * 60 * 60_000
    );
    for (const event of events) {
      if (event.startAt === null) continue;
      this.scheduler.schedule({
        id: `google-calendar.join:${event.accountId}:${event.calendarId}:${event.eventId}`,
        ownerId: accountId,
        kind: "google-calendar.join-ready",
        runAt: Math.max(now, event.startAt - 5 * 60_000),
        state: {
          accountId: event.accountId,
          calendarId: event.calendarId,
          eventId: event.eventId,
        },
      });
    }
  }

  joinUrl(identity: MeetingIdentity): string | null {
    return this.projection.meeting(identity)?.conferenceLinks[0]?.url ?? null;
  }

  upcoming(from: number, to: number): MeetingAction[] {
    return this.projection
      .upcoming(from, to)
      .flatMap((event) => {
        const link = event.conferenceLinks[0];
        if (!link || event.startAt === null) return [];
        return [{
          accountId: event.accountId,
          calendarId: event.calendarId,
          eventId: event.eventId,
          title: event.title,
          startAt: event.startAt,
          provider: link.provider,
        }];
      });
  }
}
