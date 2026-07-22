export type ScheduledTask = {
  queue: string;
  label: string;
  run: () => void;
};

/** A replayable scheduler for deliberately reordering asynchronous boundaries. */
export class DeterministicScheduler {
  private pending: ScheduledTask[] = [];
  private delivered: string[] = [];

  enqueue(queue: string, label: string, run: () => void): void {
    this.pending.push({ queue, label, run });
  }

  deliver(index: number): void {
    const [task] = this.pending.splice(index, 1);
    if (!task) throw new Error(`No scheduled task at index ${index}`);
    const traceEntry = `${task.queue}:${task.label}`;
    this.delivered.push(traceEntry);
    try {
      task.run();
    } catch (error) {
      throw new Error(
        `Scheduled task failed after [${this.delivered.join(" -> ")}]: ${error}`
      );
    }
  }

  deliverRandom(nextIndex: (max: number) => number): void {
    if (this.pending.length === 0) return;
    this.deliver(nextIndex(this.pending.length));
  }

  get size(): number {
    return this.pending.length;
  }

  get trace(): readonly string[] {
    return this.delivered;
  }
}
