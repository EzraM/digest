import { DeterministicScheduler } from "./DeterministicScheduler";

describe("DeterministicScheduler", () => {
  it("records the exact cross-queue delivery order", () => {
    const scheduler = new DeterministicScheduler();
    const delivered: string[] = [];
    scheduler.enqueue("renderer", "mount", () => delivered.push("mount"));
    scheduler.enqueue("electron", "ready", () => delivered.push("ready"));
    scheduler.enqueue("renderer", "detach", () => delivered.push("detach"));

    scheduler.deliver(2);
    scheduler.deliver(0);
    scheduler.deliver(0);

    expect(delivered).toEqual(["detach", "mount", "ready"]);
    expect(scheduler.trace).toEqual([
      "renderer:detach",
      "renderer:mount",
      "electron:ready",
    ]);
  });
});
