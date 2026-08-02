import { EventEmitter } from "node:events";
import type { WebContents, WebContentsView } from "electron";
import { HandleRegistry } from "./HandleRegistry";
import { HandleOperations } from "./HandleOperations";

type FakeHistory = {
  activeIndex: number;
  requestedIndex?: number;
  getActiveIndex(): number;
  getEntryAtIndex(index: number): { url: string } | undefined;
  goToIndex(index: number): void;
};

function harness() {
  const emitter = new EventEmitter();
  let destroyed = false;
  const history: FakeHistory = {
    activeIndex: 1,
    getActiveIndex() {
      return this.activeIndex;
    },
    getEntryAtIndex(index) {
      return [
        { url: "https://target.test/" },
        { url: "https://recent.test/" },
      ][index];
    },
    goToIndex(index) {
      this.requestedIndex = index;
    },
  };
  const webContents = Object.assign(emitter, {
    navigationHistory: history,
    isDestroyed: () => destroyed,
  }) as unknown as WebContents;
  const handles = new HandleRegistry();
  handles.set("page", { webContents } as WebContentsView);
  return {
    emitter,
    history,
    operations: new HandleOperations(handles),
    destroy: () => {
      destroyed = true;
      emitter.emit("destroyed");
    },
  };
}

const tick = () => new Promise<void>((resolve) => queueMicrotask(resolve));

describe("HandleOperations history preparation", () => {
  it("does not expose the recent page while target history navigation is pending", async () => {
    const { emitter, history, operations } = harness();
    const preparation = operations.prepareNavigationEntry(
      "page",
      "https://target.test/",
      0
    );
    expect(preparation.state).toBe("pending");
    if (preparation.state !== "pending") throw new Error("expected pending");

    let settled = false;
    void preparation.completion.then(() => {
      settled = true;
    });
    emitter.emit("did-stop-loading");
    emitter.emit("dom-ready");
    await tick();
    expect(settled).toBe(false);

    history.activeIndex = 0;
    emitter.emit("did-navigate", {}, "https://target.test/");
    expect(await preparation.completion).toEqual({
      success: true,
      value: { activeIndex: 0 },
    });
  });

  it("treats terminal main-frame errors and renderer loss as failures", async () => {
    for (const terminal of ["failure", "destroyed"] as const) {
      const { emitter, operations, destroy } = harness();
      const preparation = operations.prepareNavigationEntry(
        "page",
        "https://target.test/",
        0
      );
      if (preparation.state !== "pending") throw new Error("expected pending");
      if (terminal === "failure") {
        emitter.emit(
          "did-fail-load",
          {},
          -105,
          "NAME_NOT_RESOLVED",
          "https://target.test/",
          true
        );
      } else {
        destroy();
      }
      const result = await preparation.completion;
      expect(result.success).toBe(false);
    }
  });

  it("survives randomized loading-event order without early success", async () => {
    const eventNames = [
      "did-navigate",
      "did-navigate-in-page",
      "did-finish-load",
      "did-stop-loading",
      "dom-ready",
    ];
    let seed = 0x51f15e;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0x100000000;
    };

    for (let run = 0; run < 200; run += 1) {
      const { emitter, history, operations } = harness();
      const preparation = operations.prepareNavigationEntry(
        "page",
        "https://target.test/",
        0
      );
      if (preparation.state !== "pending") throw new Error("expected pending");
      let settled = false;
      void preparation.completion.then(() => {
        settled = true;
      });

      const noise = Array.from(
        { length: 1 + Math.floor(random() * 20) },
        () => eventNames[Math.floor(random() * eventNames.length)]
      );
      for (const event of noise) {
        emitter.emit(event, {}, "https://recent.test/", false, true);
        if (random() < 0.25) {
          emitter.emit(
            "did-fail-load",
            {},
            -3,
            "ERR_ABORTED",
            "https://recent.test/",
            true
          );
        }
      }
      await tick();
      expect(settled).toBe(false);

      history.activeIndex = 0;
      emitter.emit(eventNames[Math.floor(random() * eventNames.length)]);
      const result = await preparation.completion;
      expect(result).toEqual({ success: true, value: { activeIndex: 0 } });

      // Late and duplicate native events must be harmless after settlement.
      for (const event of noise) emitter.emit(event);
    }
  });
});
