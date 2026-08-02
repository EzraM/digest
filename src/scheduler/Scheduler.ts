import { log } from "../utils/mainLogger";
import { ScheduledJob, ScheduledJobStore } from "./ScheduledJobStore";

export type JobResult =
  | { complete: true }
  | { runAt: number; state?: unknown };

export interface JobHandler<State = unknown> {
  kind: string;
  run(job: ScheduledJob<State>): Promise<JobResult>;
}

export class Scheduler {
  private readonly handlers = new Map<string, JobHandler>();
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly store: ScheduledJobStore,
    private readonly leaseMs = 60_000
  ) {}

  register(handler: JobHandler): void {
    if (this.handlers.has(handler.kind)) {
      throw new Error(`Job handler already registered: ${handler.kind}`);
    }
    this.handlers.set(handler.kind, handler);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.arm();
  }

  stop(): void {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  wake(): void {
    if (!this.running) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    void this.runDue();
  }

  private arm(): void {
    if (!this.running) return;
    const next = this.store.next();
    if (!next) return;
    const delay = Math.max(0, Math.min(next.runAt - Date.now(), 2_147_483_647));
    this.timer = setTimeout(() => void this.runDue(), delay);
  }

  private async runDue(): Promise<void> {
    if (!this.running) return;
    this.timer = null;
    const jobs = this.store.claimDue(Date.now(), this.leaseMs);
    for (const job of jobs) {
      const handler = this.handlers.get(job.kind);
      if (!handler) {
        this.store.fail(job.id, Date.now() + 60_000, `No handler for ${job.kind}`);
        continue;
      }
      try {
        const result = await handler.run(job);
        if ("complete" in result) {
          this.store.complete(job.id);
        } else {
          this.store.reschedule(job.id, result.runAt, result.state ?? job.state);
        }
      } catch (error) {
        const retryMs = Math.min(60_000 * 2 ** job.attempts, 60 * 60_000);
        this.store.fail(job.id, Date.now() + retryMs, error);
        log.debug(`Scheduled job ${job.id} failed: ${error}`, "Scheduler");
      }
    }
    this.arm();
  }
}
