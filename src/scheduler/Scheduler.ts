import { log } from "../utils/mainLogger";
import { ScheduledJob, ScheduledJobStore } from "./ScheduledJobStore";

export type JobResult =
  | { complete: true }
  | { runAt: number; state?: unknown };

export interface JobHandler<State = unknown> {
  kind: string;
  run(job: ScheduledJob<State>): Promise<JobResult>;
}

export type TimerHandle = ReturnType<typeof setTimeout>;

export interface SchedulerClock {
  now(): number;
  setTimeout(callback: () => void, delay: number): TimerHandle;
  clearTimeout(handle: TimerHandle): void;
}

export const systemSchedulerClock: SchedulerClock = {
  now: () => Date.now(),
  setTimeout: (callback, delay) => setTimeout(callback, delay),
  clearTimeout: (handle) => clearTimeout(handle),
};

export class Scheduler {
  private readonly handlers = new Map<string, JobHandler>();
  private timer: TimerHandle | null = null;
  private running = false;
  private drain: Promise<void> | null = null;

  constructor(
    private readonly store: ScheduledJobStore,
    private readonly leaseMs = 60_000,
    private readonly clock: SchedulerClock = systemSchedulerClock
  ) {}

  register(handler: JobHandler): void {
    if (this.handlers.has(handler.kind)) {
      throw new Error(`Job handler already registered: ${handler.kind}`);
    }
    this.handlers.set(handler.kind, handler);
  }

  schedule<State>(job: Omit<ScheduledJob<State>, "attempts">): void {
    this.store.put(job);
    this.wake();
  }

  removeOwner(ownerId: string): void {
    this.store.removeOwner(ownerId);
    this.wake();
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.arm();
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.timer) this.clock.clearTimeout(this.timer);
    this.timer = null;
    await this.drain;
  }

  async whenIdle(): Promise<void> {
    await this.drain;
  }

  wake(): void {
    if (!this.running) return;
    if (this.timer) this.clock.clearTimeout(this.timer);
    this.timer = null;
    this.startDrain();
  }

  private arm(): void {
    if (!this.running) return;
    const now = this.clock.now();
    const nextRunAt = this.store.nextRunAt(now);
    if (nextRunAt === null) return;
    const delay = Math.max(0, Math.min(nextRunAt - now, 2_147_483_647));
    this.timer = this.clock.setTimeout(() => this.startDrain(), delay);
  }

  private startDrain(): void {
    if (!this.running || this.drain) return;
    this.timer = null;
    this.drain = this.runDue().finally(() => {
      this.drain = null;
      this.arm();
    });
  }

  private async runDue(): Promise<void> {
    while (this.running) {
      const job = this.store.claimNextDue(this.clock.now(), this.leaseMs);
      if (!job) return;
      const handler = this.handlers.get(job.kind);
      if (!handler) {
        this.store.fail(
          job.id,
          this.clock.now() + 60_000,
          `No handler for ${job.kind}`
        );
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
        this.store.fail(job.id, this.clock.now() + retryMs, error);
        log.debug(`Scheduled job ${job.id} failed: ${error}`, "Scheduler");
      }
    }
  }
}
