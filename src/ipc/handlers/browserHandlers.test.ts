import { createBrowserHandlers } from "./browserHandlers";
import { ViewStore } from "../../services/ViewStore";

describe("browser handlers", () => {
  it("routes presentation through sender ownership and canonical placement", () => {
    let received: any;
    const store = {
      openReference: (command: unknown) => {
        received = command;
      },
    } as ViewStore;
    const event = { sender: { id: 22 } } as any;
    const handlers = createBrowserHandlers(
      (candidate) => {
        expect(candidate).toBe(event);
        return store;
      },
      () => "placement-window-b"
    );
    const handler = handlers["update-browser-view"];
    if (handler.type !== "on") throw new Error("expected event handler");

    handler.fn(event, {
      placementId: "primary-browser",
      routeId: "url:example",
      blockId: "reference",
      url: "https://example.test/",
      bounds: { x: 0, y: 0, width: 100, height: 100 },
      profileId: "profile",
      layout: "full",
      referenceKind: "ephemeral-url",
      placementGeneration: 1,
      transitionGeneration: 1,
    });

    expect(received.placementId).toBe("placement-window-b");
  });

  it("captures selection from the handle currently attached to the placement", async () => {
    const executeJavaScript = async (script: string) =>
      script === "document.title"
        ? "Current page"
        : {
            success: true,
            selectionText: "current selection",
            selectionHtml: "current selection",
          };
    const currentView = {
      webContents: {
        isDestroyed: () => false,
        getURL: () => "https://current.example/",
        executeJavaScript,
      },
    };
    const staleView = {
      webContents: {
        isDestroyed: () => false,
        getURL: () => "https://previous.example/",
        executeJavaScript: async () => {
          throw new Error("stale view should not be queried");
        },
      },
    };
    let notification: { sourceUrl: string } | undefined;
    const viewStore = {
      getHandleIdForPlacement: (placementId: string) =>
        placementId === "primary-browser" ? "current-handle" : undefined,
      getHandleRegistry: () =>
        new Map([
          ["primary-browser", staleView],
          ["current-handle", currentView],
        ]),
      notifyBrowserSelection: (selection: { sourceUrl: string }) => {
        notification = selection;
      },
    } as unknown as ViewStore;

    const handler = createBrowserHandlers(viewStore)[
      "browser:capture-selection"
    ] as { fn: (event: unknown, viewId: string) => Promise<unknown> };
    const result = await handler.fn(undefined, "primary-browser");

    expect(result).toEqual({
      success: true,
      selectionText: "current selection",
      selectionHtml: "current selection",
    });
    expect(notification?.sourceUrl).toBe("https://current.example/");
  });
});
