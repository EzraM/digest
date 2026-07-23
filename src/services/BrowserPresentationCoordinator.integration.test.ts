import type {
  BrowserWindow,
  WebContents,
  WebContentsView,
} from "electron";
import { Command } from "../domains/browser-views/core/commands";
import { HandleRegistry } from "../domains/browser-views/adapter/HandleRegistry";
import { WindowPresentationStore } from "./WindowPresentationStore";
import type {
  ViewEffects,
  ViewEvents,
  ViewHandleOperations,
  ViewNotifications,
} from "./BrowserPresentationContracts";
import { BrowsingJourneyStore } from "./BrowsingJourneyStore";
import { ApplicationJourneyAllocator } from "./ApplicationJourneyAllocator";
import { BrowserPresentationCoordinator } from "./BrowserPresentationCoordinator";

type Effect = {
  type: string;
  id?: string;
  identity?: import("../types/browser").BrowserPresentationIdentity;
};

function fakeView(url: string): WebContentsView {
  const webContents = {
    isDestroyed: () => false,
    getURL: () => url,
  } as unknown as WebContents;
  return { webContents } as WebContentsView;
}

const firstHandleIdFor = (placementId: string) => `native:${placementId}:1`;

function createHarness(options: {
  attachSucceeds?: boolean;
  cacheLimit?: number;
} = {}) {
  const effects: Effect[] = [];
  const handles = new HandleRegistry();
  let now = 100;
  let nextHandleId = 0;
  const notifications: ViewNotifications = {
    notify: () => undefined,
    notifyPlacementReady: (identity) =>
      effects.push({
        type: "placement-ready",
        id: identity.placementId,
        identity,
      }),
    notifyLiveReferencesChanged: () =>
      effects.push({ type: "live-projection" }),
    notifyBrowserSelection: () => undefined,
  };
  const events: ViewEvents = {
    attach: (id) => {
      effects.push({ type: "listeners-attached", id });
      return () => effects.push({ type: "listeners-disposed", id });
    },
    setBackgroundLinkClickCallback: () => undefined,
  };
  const operations: ViewHandleOperations = {
    getNavigationPosition: (id) => ({
      success: true,
      value: {
        activeIndex: 0,
        url: handles.get(id)?.webContents.getURL() ?? "",
      },
    }),
    prepareNavigationEntry: () => ({
      success: true,
      value: { activeIndex: 0 },
    }),
    getDevToolsState: () => ({ success: true, value: { isOpen: false } }),
    toggleDevTools: () => ({ success: true, value: { isOpen: true } }),
    goBack: () => ({ success: true, value: { canGoBack: false } }),
  };
  const createEffects = (
    onViewCreated: (
      id: string,
      view: WebContentsView,
      profileId: string
    ) => void
  ): ViewEffects => ({
    interpret: (command: Command) => {
      effects.push({ type: command.type, id: command.id });
      if (command.type === "create") {
        const view = fakeView(command.url);
        handles.set(command.id, view);
        onViewCreated(command.id, view, command.profile);
      } else if (
        command.type === "remove" ||
        command.type === "rendererGone"
      ) {
        handles.delete(command.id);
      }
    },
    attachView: (id) => {
      effects.push({ type: "attach", id });
      return (options.attachSucceeds ?? true) && handles.has(id);
    },
    detachView: (id) => effects.push({ type: "detach", id }),
  });
  const allocator = new ApplicationJourneyAllocator({
    journeys: new BrowsingJourneyStore(options.cacheLimit ?? 10),
    handles,
  });
  const store = new WindowPresentationStore(
    {} as BrowserWindow,
    undefined,
    {} as WebContents,
    undefined,
    {
      now: () => now,
      createHandleId: (placementId) =>
        `native:${placementId}:${++nextHandleId}`,
      handles,
      resolvePresentationIdentity: (handleId) =>
        allocator.getActiveMappingForHandle(handleId),
      resolveHandleIdForPlacement: (placementId) =>
        allocator.getHandleIdForPlacement(placementId),
      onRendererGone: (handleId) => {
        const placementId = allocator.getActivePlacementId(handleId);
        allocator.removeJourney(handleId);
        return placementId;
      },
      onNavigation: (handleId, url, historyIndex) =>
        allocator.recordNavigation(handleId, url, historyIndex),
      publishLivePages: () => {
        allocator.syncLivePages();
      },
      subscribeLivePages: (listener) =>
        allocator.subscribeLivePages(listener),
      notifications,
      events,
      contextMenus: {
        setImageContextCallback: () => undefined,
        open: () => undefined,
      },
      operations,
      createEffects,
    }
  );
  const coordinator = new BrowserPresentationCoordinator(
    allocator,
    () => store,
    undefined,
    () => now
  );
  const request = (
    viewId: string,
    url = "https://example.test/",
    placementGeneration = 1000
  ) => ({
    routeId: `route:${viewId}`,
    placementId: viewId,
    referenceId: viewId.replace(":full", ""),
    url,
    bounds: { x: 10, y: 20, width: 800, height: 600 },
    profileId: "profile",
    layout: "full" as const,
    referenceKind: "site-block" as const,
    placementGeneration,
    transitionGeneration: placementGeneration,
  });
  return {
    store,
    coordinator,
    allocator,
    effects,
    handles,
    request,
    advanceTime: () => {
      now += 10;
    },
  };
}

describe("BrowserPresentationCoordinator fake-native integration", () => {
  it("opens, resizes, detaches, reattaches, and destroys one live journey", () => {
    const { store, coordinator, allocator, effects, handles, request, advanceTime } = createHarness();
    const baseRequest = request("page:full");

    expect(coordinator.openReference(baseRequest)).toMatchObject({
      outcome: "miss",
      loadAvoided: false,
    });
    expect(handles.has(firstHandleIdFor("page:full"))).toBe(true);

    coordinator.openReference({
      ...baseRequest,
      bounds: { ...baseRequest.bounds, height: 520 },
    });
    expect(
      store.getWorld().get(firstHandleIdFor("page:full"))?.bounds.height
    ).toBe(520);

    coordinator.detachPlacement({
      placementId: "page:full",
      placementGeneration: 1000,
      transitionGeneration: 1000,
    });
    advanceTime();
    expect(
      coordinator.openReference({
        ...baseRequest,
        placementGeneration: 2000,
        transitionGeneration: 2000,
      })
    ).toMatchObject({ outcome: "hit_current", loadAvoided: true });

    coordinator.removePlacement("page:full");
    expect(handles.has(firstHandleIdFor("page:full"))).toBe(false);
    expect(effects.map((effect) => effect.type)).toEqual([
      "create",
      "listeners-attached",
      "live-projection",
      "updateBounds",
      "detach",
      "attach",
      "updateBounds",
      "placement-ready",
      "listeners-disposed",
      "remove",
      "live-projection",
    ]);
  });

  it("clears liveness and ignores delayed load events after a renderer crash", () => {
    const { store, coordinator, allocator, effects, handles, request } = createHarness();
    coordinator.openReference(request("page:full"));

    store.dispatch({
      type: "rendererGone",
      id: firstHandleIdFor("page:full"),
      reason: "crashed",
    });
    const effectCountAfterCrash = effects.length;
    store.dispatch({ type: "markReady", id: firstHandleIdFor("page:full") });

    expect(store.getWorld().has(firstHandleIdFor("page:full"))).toBe(false);
    expect(allocator.getLiveReferences()).toEqual([]);
    expect(handles.has(firstHandleIdFor("page:full"))).toBe(false);
    expect(effects.length).toBe(effectCountAfterCrash);
  });

  it("allows immediate fresh creation after a renderer crash", () => {
    const { store, coordinator, allocator, handles, request } = createHarness();
    coordinator.openReference(request("page:full"));
    store.dispatch({
      type: "rendererGone",
      id: firstHandleIdFor("page:full"),
      reason: "crashed",
    });

    expect(
      coordinator.openReference(request("page:full", undefined, 2000))
    ).toMatchObject({ outcome: "miss", loadAvoided: false });
    expect(handles.has("native:page:full:2")).toBe(true);
  });

  it("destroys a failed reuse candidate and creates a fresh view", () => {
    const { store, coordinator, allocator, handles, request, advanceTime } = createHarness({
      attachSucceeds: false,
    });
    coordinator.openReference(request("first:full"));
    coordinator.detachPlacement({
      placementId: "first:full",
      placementGeneration: 1000,
      transitionGeneration: 1000,
    });
    advanceTime();

    expect(
      coordinator.openReference(request("second:full", undefined, 2000))
    ).toMatchObject({
      outcome: "miss",
      missReason: "attach_failed",
      loadAvoided: false,
    });
    expect(handles.has(firstHandleIdFor("first:full"))).toBe(false);
    expect(handles.has("native:second:full:2")).toBe(true);
  });

  it("evicts an older detached renderer when a new journey exceeds capacity", () => {
    const { store, coordinator, allocator, handles, request } = createHarness({ cacheLimit: 1 });
    coordinator.openReference(request("first:full", "https://first.test/"));
    coordinator.detachPlacement({
      placementId: "first:full",
      placementGeneration: 1000,
      transitionGeneration: 1000,
    });
    coordinator.openReference(
      request("second:full", "https://second.test/", 2000)
    );

    expect(handles.has(firstHandleIdFor("first:full"))).toBe(false);
    expect(handles.has("native:second:full:2")).toBe(true);
    expect(allocator.getLiveReferences()).toEqual([
      { profileId: "profile", url: "https://second.test/" },
    ]);
  });

  it("rejects cleanup from the pre-reload renderer generation", () => {
    const { store, coordinator, allocator, effects, request } = createHarness();
    coordinator.openReference(request("page:full", undefined, 1000));
    coordinator.detachPlacement({
      placementId: "page:full",
      placementGeneration: 1000,
      transitionGeneration: 1000,
    });
    coordinator.openReference(request("page:full", undefined, 2000));
    const detachCount = effects.filter(
      (effect) => effect.type === "detach"
    ).length;

    coordinator.detachPlacement({
      placementId: "page:full",
      placementGeneration: 1000,
      transitionGeneration: 1000,
    });

    expect(
      effects.filter((effect) => effect.type === "detach").length
    ).toBe(detachCount);
  });

  it("traces retained-handle reuse with one complete identity mapping", () => {
    const { store, coordinator, allocator, effects, request } = createHarness();
    const retainedPlacementId = "ephemeral-profile/browse/PS-5606:full";
    const retainedHandleId = firstHandleIdFor(retainedPlacementId);
    const requestedPlacementId = "ephemeral-profile/browse/PD-3772:full";
    const url = "https://identity.test/";

    coordinator.openReference(request(retainedPlacementId, url, 40));
    coordinator.detachPlacement({
      placementId: retainedPlacementId,
      placementGeneration: 40,
      transitionGeneration: 40,
    });
    const result = coordinator.openReference({
      ...request(requestedPlacementId, url, 41),
      routeId: "route-PD-3772",
      transitionGeneration: 17,
    });

    expect(result).toMatchObject({
      outcome: "hit_current",
      loadAvoided: true,
    });
    expect(
      effects.filter((effect) => effect.type === "attach").slice(-1)[0]
    ).toEqual({ type: "attach", id: retainedHandleId });
    expect(
      effects.filter((effect) => effect.type === "placement-ready").slice(-1)[0]
    ).toEqual({
      type: "placement-ready",
      id: requestedPlacementId,
      identity: {
        routeId: "route-PD-3772",
        placementId: requestedPlacementId,
        journeyId: allocator.getJourneyId(retainedHandleId),
        handleId: retainedHandleId,
        transitionGeneration: 17,
      },
    });
  });

  it("switches the journey occupying one stable full-page placement", () => {
    const { store, coordinator, allocator, effects, handles, request } = createHarness();
    const placementId = "primary-browser";
    const firstHandleId = firstHandleIdFor(placementId);

    coordinator.openReference({
      ...request(placementId, "https://first.test/", 10),
      routeId: "block:first",
    });
    coordinator.openReference({
      ...request(placementId, "https://second.test/", 20),
      routeId: "block:second",
    });

    const activeHandleId = store.getHandleIdForPlacement(placementId);
    expect(activeHandleId).toBe("native:primary-browser:2");
    expect(handles.has(firstHandleId)).toBe(true);
    expect(
      effects.filter((effect) => effect.type === "detach").slice(-1)[0]
    ).toEqual({ type: "detach", id: firstHandleId });
    expect(allocator.getLiveReferences()).toEqual([
      { profileId: "profile", url: "https://first.test/" },
      { profileId: "profile", url: "https://second.test/" },
    ]);
  });
});
