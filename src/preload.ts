// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
import { clipboard, contextBridge, ipcRenderer } from "electron";
import { log } from "./utils/mainLogger";
import { SlashCommandResultsPayload } from "./types/slashCommand";

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
    NAVIGATION: "browser:navigation-state",
    INSERT_LINK: "browser:insert-link",
    LINK_CAPTURED: "browser:link-captured",
  },
  DOWNLOAD: {
    STARTED: "download:started",
    PROGRESS: "download:progress",
    COMPLETED: "download:completed",
    FAILED: "download:failed",
    INSERT_FILE_BLOCK: "download:insert-file-block",
  },
} as const;

contextBridge.exposeInMainWorld("electronAPI", {
  clipboard: {
    readText: () => clipboard.readText(),
    readHTML: () => clipboard.readHTML(),
    availableFormats: () => clipboard.availableFormats(),
  },
  updateBrowser: (data: {
    viewId: string;
    blockId: string;
    url: string;
    bounds: { x: number; y: number; width: number; height: number };
    profileId: string;
    layout?: "inline" | "full";
  }) => ipcRenderer.send("update-browser-view", data),
  removeBrowser: (blockId: string) => {
    ipcRenderer.send("remove-browser", blockId);
  },
  removeView: (viewId: string) => {
    log.debug(`Removing view ${viewId}`, "preload");
    ipcRenderer.send("remove-view", viewId);
  },
  browser: {
    getDevToolsState: (blockId: string) =>
      ipcRenderer.invoke("browser:get-devtools-state", blockId),
    toggleDevTools: (blockId: string) =>
      ipcRenderer.invoke("browser:toggle-devtools", blockId),
    goBack: (blockId: string) => ipcRenderer.invoke("browser:go-back", blockId),
    createBlock: (url: string, sourceBlockId?: string) => {
      log.debug(
        `Creating browser block via IPC: ${url}, sourceBlockId: ${sourceBlockId}`,
        "preload"
      );
      ipcRenderer.send("browser:create-block", { url, sourceBlockId });
    },
    setScrollPercent: (blockId: string, scrollPercent: number) => {
      log.debug(
        `Setting scroll percent for block ${blockId}: ${scrollPercent}`,
        "preload"
      );
      ipcRenderer.send("browser:set-scroll-percent", {
        blockId,
        scrollPercent,
      });
    },
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
  updateSlashCommandResults: (payload: SlashCommandResultsPayload) => {
    log.debug(
      `Updating slash command results (items: ${payload.items.length}, selected: ${payload.selectedIndex})`,
      "preload"
    );
    ipcRenderer.send("slash-command:update-results", payload);
  },
  selectSlashCommandBlock: (blockKey: string) => {
    log.debug(
      `Selecting slash command block from renderer: ${blockKey}`,
      "preload"
    );
    ipcRenderer.send("block-menu:select", blockKey);
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
      errorCode?: number;
      errorDescription?: string;
      url?: string;
    }) => void
  ) => {
    const channel = "browser:initialized";
    const handler = (_: any, data: any) => callback(data);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  },
  onBrowserNavigation: (
    callback: (data: {
      blockId: string;
      url: string;
      canGoBack?: boolean;
    }) => void
  ) => {
    const channel = EVENTS.BROWSER.NAVIGATION;
    const handler = (_: any, data: any) => callback(data);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  },
  onBrowserScrollForward: (
    callback: (data: {
      blockId: string;
      direction: "up" | "down";
      deltaY: number;
    }) => void
  ) => {
    const channel = "browser:scroll-forward";
    const handler = (_: any, data: any) => callback(data);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  },
  onBrowserSelection: (
    callback: (data: {
      blockId: string;
      sourceUrl: string;
      sourceTitle: string;
      selectionText: string;
      selectionHtml: string;
      capturedAt: number;
    }) => void
  ) => {
    const channel = "browser:selection";
    const handler = (_: any, data: any) => callback(data);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  },
  captureBrowserSelection: (blockId: string) => {
    log.debug(`Capturing selection for block ${blockId}`, "preload");
    return ipcRenderer.invoke("browser:capture-selection", blockId);
  },
  onBrowserScrollPercent: (
    callback: (data: { blockId: string; scrollPercent: number }) => void
  ) => {
    const channel = "browser:save-scroll-percent";
    const handler = (_: any, data: any) => callback(data);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  },
  onNewBrowserBlock: (
    callback: (data: { url: string; sourceBlockId?: string }) => void
  ) => {
    const subscription = (_: any, data: any) => {
      // Handle both string and object formats
      const url = typeof data === "string" ? data : data?.url;
      const sourceBlockId = data?.sourceBlockId;

      if (!url) {
        console.error("Invalid data format for browser:new-block event:", data);
        return;
      }

      log.debug(
        `Received request to create new browser block with URL: ${url}, sourceBlockId: ${sourceBlockId}`,
        "preload"
      );
      callback({ url, sourceBlockId });
    };

    ipcRenderer.on(EVENTS.BROWSER.NEW_BLOCK, subscription);

    return () => {
      ipcRenderer.removeListener(EVENTS.BROWSER.NEW_BLOCK, subscription);
    };
  },
  onInsertLink: (
    callback: (data: {
      url: string;
      title: string;
      sourceBlockId?: string;
    }) => void
  ) => {
    console.log(
      "[preload] Setting up onInsertLink IPC listener for event:",
      EVENTS.BROWSER.INSERT_LINK
    );

    const subscription = (_: any, data: any) => {
      console.log(
        "[preload] Received browser:insert-link IPC event with data:",
        data
      );

      const { url, title, sourceBlockId } = data;

      if (!url || !title) {
        console.error(
          "[preload] Invalid data format for browser:insert-link event:",
          data
        );
        return;
      }

      log.debug(
        `Received request to insert inline link: ${title} (${url}), sourceBlockId: ${sourceBlockId}`,
        "preload"
      );
      console.log("[preload] Calling renderer callback with link data");
      callback({ url, title, sourceBlockId });
    };

    ipcRenderer.on(EVENTS.BROWSER.INSERT_LINK, subscription);

    return () => {
      console.log("[preload] Cleaning up onInsertLink IPC listener");
      ipcRenderer.removeListener(EVENTS.BROWSER.INSERT_LINK, subscription);
    };
  },
  onLinkCaptured: (
    callback: (data: { url: string; title: string; capturedAt: number }) => void
  ) => {
    const subscription = (_: any, data: any) => {
      log.debug(
        `Received link captured notification: ${data.title} (${data.url})`,
        "preload"
      );
      callback(data);
    };
    ipcRenderer.on(EVENTS.BROWSER.LINK_CAPTURED, subscription);
    return () => {
      ipcRenderer.removeListener(EVENTS.BROWSER.LINK_CAPTURED, subscription);
    };
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
  profiles: {
    list: () => ipcRenderer.invoke("profiles:list"),
    create: (payload: {
      name: string;
      icon?: string | null;
      color?: string | null;
    }) => ipcRenderer.invoke("profiles:create", payload),
    rename: (payload: { profileId: string; name: string }) =>
      ipcRenderer.invoke("profiles:rename", payload),
    delete: (profileId: string) =>
      ipcRenderer.invoke("profiles:delete", profileId),
    onUpdated: (
      callback: (event: {
        profiles: import("./types/documents").ProfileRecord[];
      }) => void
    ) => {
      const channel = "profiles:updated";
      const handler = (_: unknown, data: any) => callback(data);
      ipcRenderer.on(channel, handler);
      return () => {
        ipcRenderer.removeListener(channel, handler);
      };
    },
  },
  documents: {
    getActive: () => ipcRenderer.invoke("documents:get-active"),
    getTree: (profileId?: string | null) =>
      ipcRenderer.invoke("documents:get-tree", profileId ?? null),
    create: (payload: {
      profileId: string;
      title?: string | null;
      parentDocumentId?: string | null;
      position?: number;
    }) => ipcRenderer.invoke("documents:create", payload),
    rename: (payload: { documentId: string; title: string }) =>
      ipcRenderer.invoke("documents:rename", payload),
    delete: (documentId: string) =>
      ipcRenderer.invoke("documents:delete", documentId),
    move: (payload: {
      documentId: string;
      newParentId: string | null;
      position: number;
    }) => ipcRenderer.invoke("documents:move", payload),
    moveToProfile: (payload: { documentId: string; newProfileId: string }) =>
      ipcRenderer.invoke("documents:move-to-profile", payload),
    switch: (documentId: string) =>
      ipcRenderer.invoke("documents:switch", documentId),
    onTreeUpdated: (
      callback: (data: {
        profileId: string;
        tree: import("./types/documents").DocumentTreeNode[];
      }) => void
    ) => {
      const channel = "document-tree:updated";
      const handler = (_: unknown, data: any) => callback(data);
      ipcRenderer.on(channel, handler);
      return () => {
        ipcRenderer.removeListener(channel, handler);
      };
    },
    onDocumentSwitched: (
      callback: (data: {
        document: import("./types/documents").DocumentRecord | null;
      }) => void
    ) => {
      const channel = "document:switched";
      const handler = (_: unknown, data: any) => callback(data);
      ipcRenderer.on(channel, handler);
      return () => {
        ipcRenderer.removeListener(channel, handler);
      };
    },
  },
  image: {
    saveImage: (params: {
      arrayBuffer: ArrayBuffer;
      mimeType: string;
      fileName: string;
      width?: number;
      height?: number;
      documentId?: string;
    }) => ipcRenderer.invoke("image:saveImage", params),
    getImageInfo: (id: string) => ipcRenderer.invoke("image:getImageInfo", id),
  },
  search: {
    execute: (
      query: string,
      context?: {
        documentId?: string;
        excludeBlockIds?: string[];
        minScore?: number;
      },
      limit?: number
    ) => ipcRenderer.invoke("search:execute", query, context, limit),
    getStats: () => ipcRenderer.invoke("search:get-stats"),
    webSearch: (
      query: string,
      options?: { country?: string; count?: number }
    ) => ipcRenderer.invoke("search:webSearch", query, options),
  },
  // Download events from main process
  onDownloadStarted: (
    callback: (data: {
      id: string;
      fileName: string;
      url: string;
      totalBytes: number;
      savePath: string;
    }) => void
  ) => {
    const handler = (_: any, data: any) => callback(data);
    ipcRenderer.on(EVENTS.DOWNLOAD.STARTED, handler);
    return () => ipcRenderer.removeListener(EVENTS.DOWNLOAD.STARTED, handler);
  },
  onDownloadProgress: (
    callback: (data: {
      id: string;
      receivedBytes: number;
      totalBytes: number;
    }) => void
  ) => {
    const handler = (_: any, data: any) => callback(data);
    ipcRenderer.on(EVENTS.DOWNLOAD.PROGRESS, handler);
    return () => ipcRenderer.removeListener(EVENTS.DOWNLOAD.PROGRESS, handler);
  },
  onDownloadCompleted: (
    callback: (data: {
      id: string;
      savePath: string;
      fileName: string;
    }) => void
  ) => {
    const handler = (_: any, data: any) => callback(data);
    ipcRenderer.on(EVENTS.DOWNLOAD.COMPLETED, handler);
    return () => ipcRenderer.removeListener(EVENTS.DOWNLOAD.COMPLETED, handler);
  },
  onDownloadFailed: (
    callback: (data: { id: string }) => void
  ) => {
    const handler = (_: any, data: any) => callback(data);
    ipcRenderer.on(EVENTS.DOWNLOAD.FAILED, handler);
    return () => ipcRenderer.removeListener(EVENTS.DOWNLOAD.FAILED, handler);
  },
  onDownloadInsertFileBlock: (
    callback: (data: {
      fileName: string;
      savePath: string;
      url: string;
    }) => void
  ) => {
    const handler = (_: any, data: any) => callback(data);
    ipcRenderer.on(EVENTS.DOWNLOAD.INSERT_FILE_BLOCK, handler);
    return () => ipcRenderer.removeListener(EVENTS.DOWNLOAD.INSERT_FILE_BLOCK, handler);
  },
  downloadShowInFolder: (filePath: string) => {
    ipcRenderer.send("download:show-in-folder", filePath);
  },
  downloadCancel: (downloadId: string) => {
    ipcRenderer.send("download:cancel", downloadId);
  },
});
