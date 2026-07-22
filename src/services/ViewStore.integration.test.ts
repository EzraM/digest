import type {
  BrowserWindow,
  WebContents,
  WebContentsView,
} from "electron";
import { Command } from "../domains/browser-views/core/commands";
import { HandleRegistry } from "../domains/browser-views/adapter/HandleRegistry";
import { ViewStore } from "./ViewStore";
import type {
  ViewEffects,
  ViewEvents,
  ViewHandleOperations,
  ViewNotifications,
} from "./ViewStoreContracts";
import { BrowsingJourneyStore } from "./BrowsingJourneyStore";

type Effect = { type: string; id?: string };

function fakeView(url: string): WebContentsView {
  const webContents = {
    isDestroyed: () => false,
    getURL: () => url,
  } as unknown as WebContents;
  return { webContents } as WebContentsView;
}

function createHarness(options: {
  attachSucceeds?: boolean;
  cacheLimit?: number;
} = {}) {
  const effects: Effect[] = [];
  const handles = new HandleRegistry();
  let now = 100;
  const notifications: ViewNotifications = {
    notify: () => undefined,
    notifyPlacementReady: (id) =>
      effects.push({ type: "placement-ready", id }),
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
  const store = new ViewStore(
    {} as BrowserWindow,
    undefined,
    {} as WebContents,
    undefined,
    {
      now: () => now,
      journeys: new BrowsingJourneyStore(options.cacheLimit ?? 10),
      handles,
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
  const request = (
    viewId: string,
    url = "https://example.test/",
    placementGeneration = 1000
  ) => ({
    viewId,
    blockId: viewId.replace(":full", ""),
    url,
    bounds: { x: 10, y: 20, width: 800, height: 600 },
    profileId: "profile",
    layout: "full" as const,
    placementGeneration,
  });
  return {
    store,
    effects,
    handles,
    request,
    advanceTime: () => {
      now += 10;
    },
  };
}

describe("ViewStore fake-native integration", () => {
  it("opens, resizes, detaches, reattaches, and destroys one live journey", () => {
    const { store, effects, handles, request, advanceTime } = createHarness();
    const baseRequest = request("page:full");

    expect(store.openReference(baseRequest)).toMatchObject({
      outcome: "miss",
      loadAvoided: false,
    });
    expect(handles.has("page:full")).toBe(true);

    store.openReference({
      ...baseRequest,
      bounds: { ...baseRequest.bounds, height: 520 },
    });
    expect(store.getWorld().get("page:full")?.bounds.height).toBe(520);

    store.handleDetachView("page:full", 1000);
    advanceTime();
    expect(
      store.openReference({ ...baseRequest, placementGeneration: 2000 })
    ).toMatchObject({ outcome: "hit_current", loadAvoided: true });

    store.handleRemoveView("page:full");
    expect(handles.has("page:full")).toBe(false);
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
    const { store, effects, handles, request } = createHarness();
    store.openReference(request("page:full"));

    store.dispatch({
      type: "rendererGone",
      id: "page:full",
      reason: "crashed",
    });
    const effectCountAfterCrash = effects.length;
    store.dispatch({ type: "markReady", id: "page:full" });

    expect(store.getWorld().has("page:full")).toBe(false);
    expect(store.getLiveReferences()).toEqual([]);
    expect(handles.has("page:full")).toBe(false);
    expect(effects.length).toBe(effectCountAfterCrash);
  });

  it("allows immediate fresh creation after a renderer crash", () => {
    const { store, handles, request } = createHarness();
    store.openReference(request("page:full"));
    store.dispatch({
      type: "rendererGone",
      id: "page:full",
      reason: "crashed",
    });

    expect(
      store.openReference(request("page:full", undefined, 2000))
    ).toMatchObject({ outcome: "miss", loadAvoided: false });
    expect(handles.has("page:full")).toBe(true);
  });

  it("destroys a failed reuse candidate and creates a fresh view", () => {
    const { store, handles, request, advanceTime } = createHarness({
      attachSucceeds: false,
    });
    store.openReference(request("first:full"));
    store.handleDetachView("first:full", 1000);
    advanceTime();

    expect(
      store.openReference(request("second:full", undefined, 2000))
    ).toMatchObject({
      outcome: "miss",
      missReason: "attach_failed",
      loadAvoided: false,
    });
    expect(handles.has("first:full")).toBe(false);
    expect(handles.has("second:full")).toBe(true);
  });

  it("evicts an older detached renderer when a new journey exceeds capacity", () => {
    const { store, handles, request } = createHarness({ cacheLimit: 1 });
    store.openReference(request("first:full", "https://first.test/"));
    store.handleDetachView("first:full", 1000);
    store.openReference(
      request("second:full", "https://second.test/", 2000)
    );

    expect(handles.has("first:full")).toBe(false);
    expect(handles.has("second:full")).toBe(true);
    expect(store.getLiveReferences()).toEqual([
      { profileId: "profile", url: "https://second.test/" },
    ]);
  });

  it("rejects cleanup from the pre-reload renderer generation", () => {
    const { store, effects, request } = createHarness();
    store.openReference(request("page:full", undefined, 1000));
    store.handleDetachView("page:full", 1000);
    store.openReference(request("page:full", undefined, 2000));
    const detachCount = effects.filter(
      (effect) => effect.type === "detach"
    ).length;

    store.handleDetachView("page:full", 1000);

    expect(
      effects.filter((effect) => effect.type === "detach").length
    ).toBe(detachCount);
  });
});
