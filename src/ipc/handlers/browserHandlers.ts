import { IPCHandlerMap } from "../IPCRouter";
import { ViewStore } from "../../services/ViewStore";
import { SelectionCaptureService } from "../../services/SelectionCaptureService";
import { log } from "../../utils/mainLogger";
import { toBlockId } from "../../utils/viewId";

export function createBrowserHandlers(
  viewStore: ViewStore,
  createBrowserBlockCallback?: (url: string, sourceBlockId?: string) => void
): IPCHandlerMap {
  const selectionCaptureService = new SelectionCaptureService();
  return {
    "update-browser": {
      type: "on",
      fn: (_event, _browserLayout) => {
        log.debug(`Received update-browser event`, "main");
      },
    },
    "remove-browser": {
      type: "on",
      fn: (_event, blockId: string) => {
        log.debug(`Received remove-browser event for block ${blockId}`, "main");
        viewStore.handleRemoveView(blockId);
      },
    },
    "browser:get-devtools-state": {
      type: "invoke",
      fn: (_event, blockId: string) => {
        log.debug(
          `Received browser:get-devtools-state request for block ${blockId}`,
          "main"
        );
        return viewStore.getDevToolsState(blockId);
      },
    },
    "browser:toggle-devtools": {
      type: "invoke",
      fn: (_event, blockId: string) => {
        log.debug(
          `Received browser:toggle-devtools request for block ${blockId}`,
          "main"
        );
        return viewStore.toggleDevTools(blockId);
      },
    },
    "browser:go-back": {
      type: "invoke",
      fn: async (_event, blockId: string) => {
        log.debug(
          `Received browser:go-back request for block ${blockId}`,
          "main"
        );
        return viewStore.goBack(blockId);
      },
    },
    "update-browser-view": {
      type: "on",
      fn: (_event, data) => {
        log.debug(
          `Received update-browser-view event for view ${data.viewId}`,
          "main"
        );
        viewStore.handleBlockViewUpdate(data);
      },
    },
    "remove-view": {
      type: "on",
      fn: (_event, viewId: string) => {
        log.debug(`Received remove-view for view ${viewId}`, "main");
        viewStore.handleRemoveView(viewId);
      },
    },
    "browser:create-block": {
      type: "on",
      fn: (_event, data: { url: string; sourceBlockId?: string }) => {
        log.debug(
          `Received browser:create-block request: ${data.url}, sourceBlockId: ${data.sourceBlockId}`,
          "main"
        );
        if (createBrowserBlockCallback) {
          createBrowserBlockCallback(data.url, data.sourceBlockId);
        } else {
          log.debug("No createBrowserBlock callback available", "main");
        }
      },
    },
    "browser:set-scroll-percent": {
      type: "on",
      fn: (_event, data: { blockId: string; scrollPercent: number }) => {
        log.debug(
          `Received browser:set-scroll-percent for block ${data.blockId}: ${data.scrollPercent}`,
          "main"
        );
        viewStore.setScrollPercent(data.blockId, data.scrollPercent);
      },
    },
    "browser:capture-selection": {
      type: "invoke",
      fn: async (_event, viewId: string) => {
        log.debug(
          `Received browser:capture-selection request for view ${viewId}`,
          "main"
        );

        try {
          // Get the WebContentsView for this view
          const handleRegistry = viewStore.getHandleRegistry();
          const view = handleRegistry.get(viewId);

          if (!view) {
            return {
              success: false,
              error: `No view found for ${viewId}`,
            };
          }

          const webContents = view.webContents;
          if (webContents.isDestroyed()) {
            return {
              success: false,
              error: "WebContents is destroyed",
            };
          }

          // Get current URL and title
          const url = webContents.getURL();
          const title = await webContents
            .executeJavaScript("document.title")
            .catch(() => "");

          // Capture selection
          const result = await selectionCaptureService.captureSelection(
            webContents,
            url,
            title || url
          );

          if (result.success) {
            const blockId = toBlockId(viewId);

            // Emit browser:selection event to renderer
            const rendererWebContents = viewStore.getRendererWebContents();
            if (rendererWebContents && !rendererWebContents.isDestroyed()) {
              rendererWebContents.send("browser:selection", {
                blockId,
                sourceUrl: url,
                sourceTitle: title || url,
                selectionText: result.selectionText || "",
                selectionHtml: result.selectionHtml || "",
                capturedAt: Date.now(),
              });
            }

            return {
              success: true,
              selectionText: result.selectionText,
              selectionHtml: result.selectionHtml,
            };
          } else {
            return {
              success: false,
              error: result.error || "Failed to capture selection",
            };
          }
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Unknown error";
          log.debug(
            `Error capturing selection for view ${viewId}: ${errorMessage}`,
            "main"
          );
          return {
            success: false,
            error: errorMessage,
          };
        }
      },
    },
  };
}
