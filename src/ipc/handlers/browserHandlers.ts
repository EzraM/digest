import { IpcMainEvent, IpcMainInvokeEvent } from "electron";
import { IPCHandlerMap } from "../IPCRouter";
import { ViewStore } from "../../services/ViewStore";
import { SelectionCaptureService } from "../../services/SelectionCaptureService";
import { log } from "../../utils/mainLogger";
import { toBlockId } from "../../utils/viewId";
import {
  BrowserLoadStatus,
  BrowserPageInfo,
} from "../../types/browser";
import {
  parseDetachPlacementCommand,
  parseOpenReferenceCommand,
} from "../BrowserPresentationIPC";

type BrowserSenderEvent = IpcMainEvent | IpcMainInvokeEvent;

export function createBrowserHandlers(
  viewStoreOrResolver: ViewStore | ((event: BrowserSenderEvent) => ViewStore),
  resolvePlacementId: (
    event: BrowserSenderEvent,
    rendererPlacementId: string
  ) => string = (_event, placementId) => placementId
): IPCHandlerMap {
  const storeFor = (event: BrowserSenderEvent) =>
    typeof viewStoreOrResolver === "function"
      ? viewStoreOrResolver(event)
      : viewStoreOrResolver;
  const placementFor = (event: BrowserSenderEvent, placementId: string) =>
    resolvePlacementId(event, placementId);
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
      fn: (event, blockId: string) => {
        log.debug(`Received remove-browser event for block ${blockId}`, "main");
        storeFor(event).handleRemoveView(placementFor(event, blockId));
      },
    },
    "browser:get-devtools-state": {
      type: "invoke",
      fn: (event, blockId: string) => {
        log.debug(
          `Received browser:get-devtools-state request for block ${blockId}`,
          "main"
        );
        return storeFor(event).getDevToolsState(placementFor(event, blockId));
      },
    },
    "browser:toggle-devtools": {
      type: "invoke",
      fn: (event, blockId: string) => {
        log.debug(
          `Received browser:toggle-devtools request for block ${blockId}`,
          "main"
        );
        return storeFor(event).toggleDevTools(placementFor(event, blockId));
      },
    },
    "browser:go-back": {
      type: "invoke",
      fn: async (event, blockId: string) => {
        log.debug(
          `Received browser:go-back request for block ${blockId}`,
          "main"
        );
        return storeFor(event).goBack(placementFor(event, blockId));
      },
    },
    "browser:reload": {
      type: "invoke",
      fn: (event, rendererViewId: string) => {
        const viewStore = storeFor(event);
        const viewId = placementFor(event, rendererViewId);
        const handleId = viewStore.getHandleIdForPlacement(viewId);
        if (!handleId) {
          return { success: false, error: `No active view found for ${viewId}` };
        }
        const view = viewStore.getHandleRegistry().get(handleId);
        if (!view || view.webContents.isDestroyed()) {
          return { success: false, error: `No active view found for ${viewId}` };
        }

        log.debug(
          `Received browser:reload request for view ${viewId}`,
          "main"
        );
        viewStore.reloadView(viewId);
        return { success: true };
      },
    },
    "browser:get-page-info": {
      type: "invoke",
      fn: (event, rendererViewId: string): BrowserPageInfo => {
        const viewStore = storeFor(event);
        const viewId = placementFor(event, rendererViewId);
        const handleId = viewStore.getHandleIdForPlacement(viewId);
        if (!handleId) {
          return { success: false, error: `No active view found for ${viewId}` };
        }
        const view = viewStore.getHandleRegistry().get(handleId);
        const entry = viewStore.getWorld().get(handleId);
        if (!view || view.webContents.isDestroyed() || !entry) {
          return { success: false, error: `No active view found for ${viewId}` };
        }

        const loadStatus: BrowserLoadStatus =
          entry.loadState.type === "ready"
            ? "loaded"
            : entry.loadState.type === "error"
              ? "error"
              : "loading";

        return {
          success: true,
          url: view.webContents.getURL(),
          title: view.webContents.getTitle(),
          loadStatus,
        };
      },
    },
    "update-browser-view": {
      type: "on",
      fn: (event, data: unknown) => {
        try {
          const parsed = parseOpenReferenceCommand(data);
          const command = {
            ...parsed,
            placementId: placementFor(event, parsed.placementId),
          };
          log.debug(
            `Received update-browser-view event for placement ${command.placementId}`,
            "main"
          );
          storeFor(event).openReference(command);
        } catch (error) {
          log.error(
            `Rejected update-browser-view event: ${
              error instanceof Error ? error.message : String(error)
            }`,
            "main"
          );
        }
      },
    },
    "remove-view": {
      type: "on",
      fn: (event, data: unknown) => {
        try {
          const parsed = parseDetachPlacementCommand(data);
          const command = {
            ...parsed,
            placementId: placementFor(event, parsed.placementId),
          };
          log.debug(
            `Received detach request for placement ${command.placementId}`,
            "main"
          );
          storeFor(event).handleDetachView(command);
        } catch (error) {
          log.error(
            `Rejected remove-view event: ${
              error instanceof Error ? error.message : String(error)
            }`,
            "main"
          );
        }
      },
    },
    "browser:get-live-pages": {
      type: "invoke",
      fn: (event) => storeFor(event).getLivePagesProjection(),
    },
    "browser:capture-selection": {
      type: "invoke",
      fn: async (event, rendererViewId: string) => {
        const viewStore = storeFor(event);
        const viewId = placementFor(event, rendererViewId);
        log.debug(
          `Received browser:capture-selection request for view ${viewId}`,
          "main"
        );

        try {
          // Renderer controls address browser views by placement. Resolve the
          // placement to its currently attached handle so a reused placement
          // cannot capture from a previously attached journey.
          const handleId = viewStore.getHandleIdForPlacement(viewId);
          if (!handleId) {
            return {
              success: false,
              error: `No active view found for ${viewId}`,
            };
          }

          const handleRegistry = viewStore.getHandleRegistry();
          const view = handleRegistry.get(handleId);

          if (!view) {
            return {
              success: false,
              error: `No active view found for ${viewId}`,
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
            const blockId = toBlockId(handleId);

            viewStore.notifyBrowserSelection({
              blockId,
              sourceUrl: url,
              sourceTitle: title || url,
              selectionText: result.selectionText || "",
              selectionHtml: result.selectionHtml || "",
              capturedAt: Date.now(),
            });

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
