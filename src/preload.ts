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
  updateBrowser: (data: {
    blockId: string;
    url: string;
    bounds: { x: number; y: number; width: number; height: number };
  }) => ipcRenderer.send("update-browser-view", data),
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
    const channel = "browser:initialized";
    const handler = (_: any, data: any) => callback(data);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
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
  // Content processing
  processIntelligentUrl: (input: string, context?: any) =>
    ipcRenderer.invoke("content-process", input, context),

  isIntelligentUrlAvailable: () =>
    ipcRenderer.invoke("content-available"),

  // Block creation processing
  processInputCreateBlocks: (input: string, context?: any) =>
    ipcRenderer.invoke("process-input-create-blocks", input, context),

  isBlockCreationAvailable: () =>
    ipcRenderer.invoke("block-creation-available"),

  // Focus prompt overlay
  focusPromptOverlay: () => {
    log.debug("Requesting prompt overlay focus", "preload");
    ipcRenderer.send("prompt-overlay:focus");
  },

  // Update prompt overlay bounds
  updatePromptOverlayBounds: (bounds: { x: number; y: number; width: number; height: number }) => {
    log.debug(`Updating prompt overlay bounds: ${JSON.stringify(bounds)}`, "preload");
    ipcRenderer.send("prompt-overlay:update-bounds", bounds);
  },

  // Update document state (continuous sync)
  updateDocumentState: (documentState: any) => {
    log.debug(
      `Updating document state: ${documentState?.blockCount || 0} blocks`,
      "preload"
    );
    ipcRenderer.send("document-state:update", documentState);
  },

  // Block operations for unified processing with transaction metadata
  applyBlockOperations: (operations: any[], origin?: any) => {
    log.debug(
      `Applying ${operations.length} block operations ${
        origin?.batchId ? `(batch: ${origin.batchId})` : ""
      }`,
      "preload"
    );
    return ipcRenderer.invoke("block-operations:apply", operations, origin);
  },

  // Signal renderer ready to receive document updates
  signalRendererReady: () => {
    log.debug("Signaling renderer ready for document updates", "preload");
    ipcRenderer.send("renderer-ready");
  },

  onDocumentUpdate: (callback: (updateData: any) => void) => {
    const subscription = (_: any, updateData: any) => {
      log.debug(
        `Received document update: ${updateData?.blocks?.length || 0} blocks`,
        "preload"
      );
      callback(updateData);
    };
    ipcRenderer.on("document-update", subscription);
    return () => {
      ipcRenderer.removeListener("document-update", subscription);
    };
  },

  removeDocumentUpdateListener: (callback: (updateData: any) => void) => {
    ipcRenderer.removeListener("document-update", callback);
  },

  // Console log forwarding
  forwardLog: (logData: {
    level: string;
    message: string;
    timestamp: string;
    source: string;
  }) => {
    ipcRenderer.send("renderer-log", logData);
  },

  // Debug event functionality
  debug: {
    toggle: () => {
      log.debug("Toggling debug mode", "preload");
      return ipcRenderer.invoke("debug:toggle");
    },
    isEnabled: () => ipcRenderer.invoke("debug:is-enabled"),
    getEvents: (filter?: any) => ipcRenderer.invoke("debug:get-events", filter),
    getSessionEvents: () => ipcRenderer.invoke("debug:get-session-events"),
    clearEvents: () => ipcRenderer.invoke("debug:clear-events"),
    
    onModeChanged: (callback: (enabled: boolean) => void) => {
      const subscription = (_: any, enabled: boolean) => {
        log.debug(`Debug mode changed: ${enabled}`, "preload");
        callback(enabled);
      };
      ipcRenderer.on("debug:mode-changed", subscription);
      return () => {
        ipcRenderer.removeListener("debug:mode-changed", subscription);
      };
    },

    onNewEvent: (callback: (event: any) => void) => {
      const subscription = (_: any, event: any) => {
        log.debug(`Received debug event: ${event.eventType}`, "preload");
        callback(event);
      };
      ipcRenderer.on("debug:new-event", subscription);
      return () => {
        ipcRenderer.removeListener("debug:new-event", subscription);
      };
    },

    onInitialEvents: (callback: (events: any[]) => void) => {
      const subscription = (_: any, events: any[]) => {
        log.debug(`Received ${events.length} initial debug events`, "preload");
        callback(events);
      };
      ipcRenderer.on("debug:initial-events", subscription);
      return () => {
        ipcRenderer.removeListener("debug:initial-events", subscription);
      };
    },
  },
});
