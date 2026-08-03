import Database from "better-sqlite3";
import { ScheduledJobStore } from "./ScheduledJobStore";
import {
  Scheduler,
  SchedulerClock,
  TimerHandle,
} from "./Scheduler";
import { IntegrationRegistry } from "../integrations/IntegrationPlugin";
import { SchedulerProbePlugin } from "../integrations/development/SchedulerProbePlugin";

class FakeClock implements SchedulerClock {
  private time: number;
  private nextId = 1;
  private readonly timers = new Map<
    number,
    { callback: () => void; dueAt: number }
  >();

  constructor(now = 0) {
    this.time = now;
  }

  now(): number {
    return this.time;
  }

  setTimeout(callback: () => void, delay: number): TimerHandle {
    const id = this.nextId++;
    this.timers.set(id, { callback, dueAt: this.time + delay });
    return id as unknown as TimerHandle;
  }

  clearTimeout(handle: TimerHandle): void {
    this.timers.delete(handle as unknown as number);
  }

  advanceTo(time: number): void {
    this.time = time;
    const due = [...this.timers.entries()]
      .filter(([, timer]) => timer.dueAt <= time)
      .sort((left, right) => left[1].dueAt - right[1].dueAt);
    for (const [id, timer] of due) {
      if (!this.timers.delete(id)) continue;
      timer.callback();
    }
  }

  get timerCount(): number {
    return this.timers.size;
  }
}

const createStore = () => {
  const database = new Database(":memory:");
  database.exec(`
    CREATE TABLE scheduled_jobs (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      run_at INTEGER NOT NULL,
      state_json TEXT NOT NULL DEFAULT '{}',
      attempts INTEGER NOT NULL DEFAULT 0,
      lease_expires_at INTEGER,
      last_error TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
  return { database, store: new ScheduledJobStore(database) };
};

const put = (
  store: ScheduledJobStore,
  runAt: number,
  state: unknown = { value: "original" },
  kind = "test.job"
) =>
  store.put({
    id: "job-1",
    ownerId: "test",
    kind,
    runAt,
    state,
  });

const settle = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

describe("Scheduler", () => {
  it("fires a future job at its due time", async () => {
    const { database, store } = createStore();
    const clock = new FakeClock();
    let runs = 0;
    put(store, 100);
    const scheduler = new Scheduler(store, 1_000, clock);
    scheduler.register({
      kind: "test.job",
      async run() {
        runs += 1;
        return { complete: true };
      },
    });

    scheduler.start();
    clock.advanceTo(99);
    await settle();
    expect(runs).toBe(0);
    clock.advanceTo(100);
    await settle();
    expect(runs).toBe(1);
    expect(store.next(100)).toBe(null);
    database.close();
  });

  it("preserves updated state when a handler reschedules", async () => {
    const { database, store } = createStore();
    const clock = new FakeClock();
    put(store, 10);
    const scheduler = new Scheduler(store, 1_000, clock);
    scheduler.register({
      kind: "test.job",
      async run() {
        return { runAt: 20, state: { value: "updated" } };
      },
    });

    scheduler.start();
    clock.advanceTo(10);
    await settle();
    expect(store.next(10)?.state).toEqual({ value: "updated" });
    expect(store.next(10)?.runAt).toBe(20);
    scheduler.stop();
    database.close();
  });

  it("backs failed jobs off", async () => {
    const { database, store } = createStore();
    const clock = new FakeClock();
    put(store, 0);
    const scheduler = new Scheduler(store, 1_000, clock);
    scheduler.register({
      kind: "test.job",
      async run() {
        throw new Error("nope");
      },
    });

    scheduler.start();
    clock.advanceTo(0);
    await settle();
    expect(store.next(0)?.runAt).toBe(60_000);
    expect(store.next(0)?.attempts).toBe(1);
    scheduler.stop();
    database.close();
  });

  it("does not claim an active lease and reclaims it when expired", async () => {
    const { database, store } = createStore();
    const clock = new FakeClock(50);
    let runs = 0;
    put(store, 0);
    expect(store.claimNextDue(0, 100)?.id).toBe("job-1");
    const scheduler = new Scheduler(store, 1_000, clock);
    scheduler.register({
      kind: "test.job",
      async run() {
        runs += 1;
        return { complete: true };
      },
    });

    scheduler.start();
    clock.advanceTo(99);
    await settle();
    expect(runs).toBe(0);
    clock.advanceTo(100);
    await settle();
    expect(runs).toBe(1);
    database.close();
  });

  it("wake runs overdue jobs immediately", async () => {
    const { database, store } = createStore();
    const clock = new FakeClock(100);
    let runs = 0;
    put(store, 50);
    const scheduler = new Scheduler(store, 1_000, clock);
    scheduler.register({
      kind: "test.job",
      async run() {
        runs += 1;
        return { complete: true };
      },
    });

    scheduler.start();
    scheduler.wake();
    await settle();
    expect(runs).toBe(1);
    database.close();
  });

  it("stop prevents later execution", async () => {
    const { database, store } = createStore();
    const clock = new FakeClock();
    let runs = 0;
    put(store, 100);
    const scheduler = new Scheduler(store, 1_000, clock);
    scheduler.register({
      kind: "test.job",
      async run() {
        runs += 1;
        return { complete: true };
      },
    });

    scheduler.start();
    scheduler.stop();
    clock.advanceTo(100);
    await settle();
    expect(runs).toBe(0);
    expect(store.next(100)?.id).toBe("job-1");
    database.close();
  });

  it("backs off a missing handler instead of looping", async () => {
    const { database, store } = createStore();
    const clock = new FakeClock();
    put(store, 0, {}, "missing.job");
    const scheduler = new Scheduler(store, 1_000, clock);

    scheduler.start();
    clock.advanceTo(0);
    await settle();
    expect(store.next(0)?.runAt).toBe(60_000);
    expect(store.next(0)?.attempts).toBe(1);
    expect(clock.timerCount).toBe(1);
    scheduler.stop();
    database.close();
  });

  it("runs a sample plugin through persistence and handler lookup", async () => {
    const { database, store } = createStore();
    const clock = new FakeClock();
    const scheduler = new Scheduler(store, 1_000, clock);
    const registry = new IntegrationRegistry();
    const messages: string[] = [];
    registry.register(
      new SchedulerProbePlugin(
        scheduler,
        (message) => messages.push(message),
        () => clock.now()
      )
    );
    for (const handler of registry.jobHandlers()) scheduler.register(handler);

    scheduler.start();
    await registry.start();
    expect(store.next(0)?.kind).toBe("scheduler.probe");
    clock.advanceTo(4_999);
    await settle();
    expect(messages).toEqual([]);
    clock.advanceTo(5_000);
    await settle();
    expect(messages).toEqual(["Digest scheduler is alive"]);
    expect(store.next(5_000)).toBe(null);
    scheduler.stop();
    database.close();
  });

  it("never overlaps drains when wakes outlive a job lease", async () => {
    const { database, store } = createStore();
    const clock = new FakeClock();
    let release: (() => void) | undefined;
    let active = 0;
    let maxActive = 0;
    let runs = 0;
    put(store, 0);
    const scheduler = new Scheduler(store, 10, clock);
    scheduler.register({
      kind: "test.job",
      async run() {
        runs += 1;
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        active -= 1;
        return { complete: true };
      },
    });

    scheduler.start();
    scheduler.wake();
    await settle();
    clock.advanceTo(20);
    for (let index = 0; index < 20; index += 1) scheduler.wake();
    await settle();
    expect(runs).toBe(1);
    expect(maxActive).toBe(1);
    release?.();
    await settle();
    await scheduler.stop();
    expect(store.next(20)).toBe(null);
    database.close();
  });

  it("fuzzes scheduling, wakes, and clock advances against an exact-once model", async () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      const { database, store } = createStore();
      const clock = new FakeClock();
      const scheduler = new Scheduler(store, 25, clock);
      const runs = new Map<string, number>();
      let randomState = seed;
      let jobSequence = 0;
      let now = 0;
      const random = () => {
        randomState = (randomState * 1_664_525 + 1_013_904_223) >>> 0;
        return randomState;
      };
      scheduler.register({
        kind: "fuzz.job",
        async run(job) {
          runs.set(job.id, (runs.get(job.id) ?? 0) + 1);
          if ((random() & 3) === 0) scheduler.wake();
          return { complete: true };
        },
      });
      scheduler.start();

      for (let step = 0; step < 250; step += 1) {
        const operation = random() % 4;
        if (operation <= 1) {
          const id = `seed-${seed}-job-${jobSequence++}`;
          scheduler.schedule({
            id,
            ownerId: `owner-${random() % 5}`,
            kind: "fuzz.job",
            runAt: now + (random() % 30),
            state: { seed, step },
          });
        } else if (operation === 2) {
          scheduler.wake();
        } else {
          now += random() % 20;
          clock.advanceTo(now);
        }
        if ((random() & 7) !== 0) await settle();
      }

      now += 1_000;
      clock.advanceTo(now);
      scheduler.wake();
      await scheduler.whenIdle();
      await scheduler.stop();
      expect(store.next(now)).toBe(null);
      expect(runs.size).toBe(jobSequence);
      expect([...runs.values()].every((count) => count === 1)).toBe(true);
      database.close();
    }
  });
});
