// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
import { contextBridge, ipcRenderer } from "electron";
import { log } from "./utils/mainLogger";

log.debug("Preload script initialized", "preload");

const EVENTS = {
  BLOCK_MENU: {
    OPEN: "block-menu:open",
    CLOSE: "block-menu:close",
    SELECT: "block-menu:select",
  },
  BROWSER: {
    INITIALIZED: "browser:initialized",
    NEW_BLOCK: "browser:new-block",
  },
} as const;

contextBridge.exposeInMainWorld("electronAPI", {
  setUrl: (url: string) => ipcRenderer.send("set-url", url),
  updateBrowser: (browserLayout: {
    x: number;
    y: number;
    width: number;
    height: number;
    blockId: string;
  }) => {
    ipcRenderer.send("update-browser", browserLayout);
  },
  updateBrowserUrl: (browserUrl: { blockId: string; url: string }) => {
    ipcRenderer.send("update-browser-url", browserUrl);
  },
  removeBrowser: (blockId: string) => {
    ipcRenderer.send("remove-browser", blockId);
  },
  addBlockEvent: (e: { type: "open" | "close" }) => {
    log.debug(`Sending event: block-menu:${e.type}`, "preload");
    ipcRenderer.send(`block-menu:${e.type}`);
  },
  startSlashCommand: () => {
    log.debug("Starting slash command", "preload");
    ipcRenderer.send("slash-command:start");
  },
  cancelSlashCommand: () => {
    log.debug("Cancelling slash command", "preload");
    ipcRenderer.send("slash-command:cancel");
  },
  onSelectBlockType: (callback: (blockKey: string) => void) => {
    const subscription = (_: any, blockKey: string) => {
      log.debug(`Received block selection: ${blockKey}`, "preload");
      callback(blockKey);
    };
    ipcRenderer.on(EVENTS.BLOCK_MENU.SELECT, subscription);
    return () => {
      ipcRenderer.removeListener(EVENTS.BLOCK_MENU.SELECT, subscription);
    };
  },
  onPromptOverlayCreateBlocks: (
    callback: (data: { xmlResponse: string; originalInput: string }) => void
  ) => {
    const subscription = (
      _: any,
      data: { xmlResponse: string; originalInput: string }
    ) => {
      log.debug(
        `Received prompt overlay create blocks: ${data.originalInput}`,
        "preload"
      );
      callback(data);
    };
    ipcRenderer.on("prompt-overlay:create-blocks", subscription);
    return () => {
      ipcRenderer.removeListener("prompt-overlay:create-blocks", subscription);
    };
  },
  onSlashCommandInsert: (callback: (blockKey: string) => void) => {
    const subscription = (_: any, blockKey: string) => {
      log.debug(
        `Received slash command block insertion: ${blockKey}`,
        "preload"
      );
      callback(blockKey);
    };
    ipcRenderer.on("slash-command:insert-block", subscription);
    return () => {
      ipcRenderer.removeListener("slash-command:insert-block", subscription);
    };
  },
  onBrowserInitialized: (
    callback: (data: {
      blockId: string;
      success: boolean;
      error?: string;
      status?: "created" | "loaded" | "existing";
    }) => void
  ) => {
    const subscription = (
      _: any,
      data: {
        blockId: string;
        success: boolean;
        error?: string;
        status?: "created" | "loaded" | "existing";
      }
    ) => {
      log.debug(
        `Browser initialization status for ${data.blockId}: ${data.success}${
          data.status ? ` (${data.status})` : ""
        }`,
        "preload"
      );
      callback(data);
    };
    ipcRenderer.on(EVENTS.BROWSER.INITIALIZED, subscription);
    return () => {
      ipcRenderer.removeListener(EVENTS.BROWSER.INITIALIZED, subscription);
    };
  },
  onNewBrowserBlock: (callback: (data: { url: string }) => void) => {
    const subscription = (_: any, data: any) => {
      // Handle both string and object formats
      const url = typeof data === "string" ? data : data?.url;

      if (!url) {
        console.error("Invalid data format for browser:new-block event:", data);
        return;
      }

      log.debug(
        `Received request to create new browser block with URL: ${url}`,
        "preload"
      );
      callback({ url });
    };

    ipcRenderer.on(EVENTS.BROWSER.NEW_BLOCK, subscription);

    return () => {
      ipcRenderer.removeListener(EVENTS.BROWSER.NEW_BLOCK, subscription);
    };
  },
  // Intelligent URL processing
  processIntelligentUrl: (input: string, context?: any) =>
    ipcRenderer.invoke("intelligent-url-process", input, context),

  isIntelligentUrlAvailable: () =>
    ipcRenderer.invoke("intelligent-url-available"),

  // Block creation processing
  processInputCreateBlocks: (input: string, context?: any) =>
    ipcRenderer.invoke("process-input-create-blocks", input, context),

  isBlockCreationAvailable: () =>
    ipcRenderer.invoke("block-creation-available"),

  // Console log forwarding
  forwardLog: (logData: {
    level: string;
    message: string;
    timestamp: string;
    source: string;
  }) => {
    ipcRenderer.send("renderer-log", logData);
  },
});
