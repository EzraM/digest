import { CredentialStore } from "../CredentialStore";
import {
  IntegrationAccountStore,
  StoredIntegrationAccount,
} from "../IntegrationAccountStore";
import { IntegrationPlugin } from "../IntegrationPlugin";
import { GoogleOAuthAuthorizer } from "./GoogleOAuthAuthorizer";
import { JobHandler, Scheduler } from "../../scheduler/Scheduler";

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
  readonly jobHandlers: JobHandler<CalendarSyncJobState>[];

  constructor(
    private readonly accounts: IntegrationAccountStore,
    private readonly credentials: CredentialStore,
    private readonly authorizer: GoogleOAuthAuthorizer,
    private readonly scheduler?: ScheduledJobs,
    private readonly syncService?: CalendarSync,
    private readonly now: () => number = () => Date.now()
  ) {
    this.jobHandlers = syncService
      ? [
          {
            kind: "google-calendar.sync",
            run: async (job) => {
              if (!this.accounts.get(job.state.accountId)) return { complete: true };
              await syncService.sync(job.state.accountId);
              return {
                runAt: this.now() + 15 * 60_000,
                state: job.state,
              };
            },
          },
        ]
      : [];
  }

  start(): void {
    for (const account of this.listAccounts()) this.scheduleSync(account.id, this.now());
  }

  listAccounts(): StoredIntegrationAccount[] {
    return this.accounts.list(this.manifest.id);
  }

  async connect(): Promise<StoredIntegrationAccount> {
    const grant = await this.authorizer.authorize();
    const id = `${this.manifest.id}:${grant.providerAccountId}`;
    const credentialKey = `${id}:refresh-token`;
    await this.credentials.write(credentialKey, grant.refreshToken);
    const account: StoredIntegrationAccount = {
      id,
      integrationId: this.manifest.id,
      providerAccountId: grant.providerAccountId,
      displayName: grant.displayName,
      email: grant.email,
      scopes: grant.scopes,
      credentialKey,
    };
    try {
      this.accounts.put(account);
      this.scheduleSync(account.id, this.now());
      return account;
    } catch (error) {
      await this.credentials.remove(credentialKey);
      throw error;
    }
  }

  async disconnect(accountId: string): Promise<void> {
    const account = this.accounts.get(accountId);
    if (!account || account.integrationId !== this.manifest.id) return;
    const refreshToken = await this.credentials.read(account.credentialKey);
    if (refreshToken) await this.authorizer.revoke(refreshToken);
    this.scheduler?.removeOwner(account.id);
    this.accounts.remove(account.id);
    await this.credentials.remove(account.credentialKey);
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
