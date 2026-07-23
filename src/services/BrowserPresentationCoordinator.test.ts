import type { WebContentsView } from "electron";
import { ApplicationJourneyAllocator } from "./ApplicationJourneyAllocator";
import { BrowserPresentationCoordinator } from "./BrowserPresentationCoordinator";
import type { OpenReferenceCommand } from "./BrowserPresentationContracts";
import type { WindowPresentationStore } from "./WindowPresentationStore";

const command = (
  placementId: string,
  generation: number
): OpenReferenceCommand => ({
  routeId: `route:${placementId}`,
  placementId,
  referenceId: "reference",
  url: "https://example.test/",
  bounds: { x: 0, y: 0, width: 800, height: 600 },
  profileId: "profile",
  layout: "full",
  referenceKind: "site-block",
  placementGeneration: generation,
  transitionGeneration: generation,
});

describe("BrowserPresentationCoordinator", () => {
  it("publishes application live-page changes to every window subscriber", () => {
    const allocator = new ApplicationJourneyAllocator();
    const revisionsA: number[] = [];
    const revisionsB: number[] = [];
    allocator.subscribeLivePages((projection) =>
      revisionsA.push(projection.revision)
    );
    allocator.subscribeLivePages((projection) =>
      revisionsB.push(projection.revision)
    );

    allocator.addVisible(
      "handle",
      "profile",
      "https://example.test/",
      {
        placementId: "placement",
        routeId: "route",
        transitionGeneration: 1,
      }
    );
    allocator.syncLivePages();

    expect(revisionsA).toEqual([1]);
    expect(revisionsB).toEqual([1]);
  });

  it("moves local presentation ownership when a detached journey changes windows", () => {
    const allocator = new ApplicationJourneyAllocator();
    const calls: string[] = [];

    const createStore = (name: string) => {
      const world = new Map();
      const store = {
        acceptPlacementUpdate: () => true,
        acceptPlacementDetach: () => true,
        getWorld: () => world,
        createHandle: (update: OpenReferenceCommand) => {
          const handleId = `handle-${name}`;
          allocator.getHandleRegistry().set(handleId, {
            webContents: {
              isDestroyed: () => false,
            },
          } as WebContentsView);
          world.set(handleId, {
            url: update.url,
            history: { canGoBack: false },
            bounds: update.bounds,
            profile: update.profileId,
            layout: update.layout,
            loadState: { type: "ready" },
          });
          calls.push(`${name}:create:${handleId}`);
          return handleId;
        },
        detachHandle: (handleId: string) =>
          calls.push(`${name}:detach:${handleId}`),
        forgetHandle: (handleId: string) => {
          world.delete(handleId);
          calls.push(`${name}:forget:${handleId}`);
        },
        adoptHandle: (handleId: string, update: OpenReferenceCommand) => {
          world.set(handleId, {
            url: update.url,
            history: { canGoBack: false },
            bounds: update.bounds,
            profile: update.profileId,
            layout: update.layout,
            loadState: { type: "ready" },
          });
          calls.push(`${name}:adopt:${handleId}`);
        },
        prepareNavigationEntry: () => true,
        attachHandle: (handleId: string) => {
          calls.push(`${name}:attach:${handleId}`);
          return true;
        },
        updatePlacementBounds: () => undefined,
        notifyPlacementReady: () => undefined,
        publishLiveReferences: () => undefined,
        removeHandle: () => undefined,
        retirePlacement: () => undefined,
      } as unknown as WindowPresentationStore;
      return { store, world };
    };

    const windowA = createStore("a");
    const windowB = createStore("b");
    const stores = new Map([
      ["placement-a", windowA.store],
      ["placement-b", windowB.store],
    ]);
    const coordinator = new BrowserPresentationCoordinator(
      allocator,
      (placementId) => {
        const store = stores.get(placementId);
        if (!store) throw new Error(`Missing test store: ${placementId}`);
        return store;
      }
    );

    coordinator.openReference(command("placement-a", 1));
    coordinator.detachPlacement({
      placementId: "placement-a",
      placementGeneration: 1,
      transitionGeneration: 1,
    });
    coordinator.openReference(command("placement-b", 1));

    expect(calls).toContain("a:forget:handle-a");
    expect(calls).toContain("b:adopt:handle-a");
    expect(calls).toContain("b:attach:handle-a");
    expect(windowA.world.has("handle-a")).toBe(false);
    expect(windowB.world.has("handle-a")).toBe(true);
    expect(allocator.getActiveMapping("placement-b")?.handleId).toBe(
      "handle-a"
    );
  });
});
