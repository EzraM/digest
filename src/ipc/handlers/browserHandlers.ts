import { IPCHandlerMap } from "../IPCRouter";
import { ViewStore } from "../../services/ViewStore";
import { log } from "../../utils/mainLogger";

export function createBrowserHandlers(
  viewStore: ViewStore,
  createBrowserBlockCallback?: (url: string, sourceBlockId?: string) => void
): IPCHandlerMap {
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
          `Received update-browser-view event for block ${data.blockId}`,
          "main"
        );
        viewStore.handleBlockViewUpdate(data);
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
  };
}
