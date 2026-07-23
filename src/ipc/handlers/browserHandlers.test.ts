import { createBrowserHandlers } from "./browserHandlers";
import { ViewStore } from "../../services/ViewStore";

describe("browser handlers", () => {
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
