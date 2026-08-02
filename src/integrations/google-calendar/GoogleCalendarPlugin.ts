import { IntegrationPlugin } from "../IntegrationPlugin";
import { JobHandler, Scheduler } from "../../scheduler/Scheduler";
import { MeetingJoinService } from "./MeetingJoinService";
import { GoogleAuthorization } from "../google/GoogleAuthorizationService";
import { StoredIntegrationAccount } from "../IntegrationAccountStore";

interface CalendarSyncJobState {
  accountId: string;
}

type ScheduledJobs = Pick<Scheduler, "schedule" | "removeOwner">;
interface CalendarSync {
  sync(accountId: string): Promise<void>;
}

export class GoogleCalendarPlugin implements IntegrationPlugin {
  readonly manifest = {
    id: "google-calendar",
    name: "Google Calendar",
    summary: "Projects upcoming Google Calendar events into Digest",
    connectionDescription: "Connect a Google account with read-only calendar access",
  };
  readonly jobHandlers: JobHandler[];

  constructor(
    private readonly authorization: GoogleAuthorization,
    private readonly scheduler?: ScheduledJobs,
    private readonly syncService?: CalendarSync,
    private readonly meetingActions?: MeetingJoinService,
    private readonly now: () => number = () => Date.now()
  ) {
    const syncHandlers: JobHandler<CalendarSyncJobState>[] = syncService
      ? [
          {
            kind: "google-calendar.sync",
            run: async (job) => {
              if (!this.hasAccount(job.state.accountId)) return { complete: true };
              await syncService.sync(job.state.accountId);
              this.meetingActions?.reconcile(job.state.accountId);
              return {
                runAt: this.now() + 15 * 60_000,
                state: job.state,
              };
            },
          },
        ]
      : [];
    this.jobHandlers = [
      ...syncHandlers,
      ...(meetingActions?.jobHandlers ?? []),
    ] as JobHandler[];
  }

  start(): void {
    for (const account of this.listAccounts()) this.scheduleSync(account.id, this.now());
  }

  listAccounts(): StoredIntegrationAccount[] {
    return this.authorization.accounts().map((account) => ({
      ...account,
      integrationId: this.manifest.id,
    }));
  }

  async connect(): Promise<StoredIntegrationAccount> {
    const account = await this.authorization.connect();
    this.scheduleSync(account.id, this.now());
    return { ...account, integrationId: this.manifest.id };
  }

  async disconnect(accountId: string): Promise<void> {
    if (!this.hasAccount(accountId)) return;
    this.scheduler?.removeOwner(accountId);
    await this.authorization.disconnect(accountId);
  }

  private hasAccount(accountId: string): boolean {
    return this.authorization.accounts().some((account) => account.id === accountId);
  }

  private scheduleSync(accountId: string, runAt: number): void {
    this.scheduler?.schedule({
      id: `google-calendar.sync:${accountId}`,
      ownerId: accountId,
      kind: "google-calendar.sync",
      runAt,
      state: { accountId },
    });
  }
}
