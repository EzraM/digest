import type {
  BrowserWindow,
  WebContents,
  WebContentsView,
} from "electron";
import { Command } from "../domains/browser-views/core/commands";
import { HandleRegistry } from "../domains/browser-views/adapter/HandleRegistry";
import {
  ViewContextMenus,
  ViewEffects,
  ViewEvents,
  ViewHandleOperations,
  ViewNotifications,
  ViewStore,
} from "./ViewStore";

type Effect = { type: string; id?: string };

function fakeView(url: string): WebContentsView {
  const webContents = {
    isDestroyed: () => false,
    getURL: () => url,
  } as unknown as WebContents;
  return { webContents } as WebContentsView;
}

describe("ViewStore fake-native integration", () => {
  it("opens, resizes, detaches, reattaches, and destroys one live journey", () => {
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
    const contextMenus: ViewContextMenus = {
      setImageContextCallback: () => undefined,
    };
    const operations: ViewHandleOperations = {
      getNavigationPosition: (id) => ({
        success: true,
        value: { activeIndex: 0, url: handles.get(id)?.webContents.getURL() ?? "" },
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
        } else if (command.type === "remove") {
          handles.delete(command.id);
        }
      },
      attachView: (id) => {
        effects.push({ type: "attach", id });
        return handles.has(id);
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
        handles,
        notifications,
        events,
        contextMenus,
        operations,
        createEffects,
      }
    );
    const baseRequest = {
      viewId: "page:full",
      blockId: "page",
      url: "https://example.test/",
      bounds: { x: 10, y: 20, width: 800, height: 600 },
      profileId: "profile",
      layout: "full" as const,
      placementGeneration: 1000,
    };

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
    now += 10;
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
});
