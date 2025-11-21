import {
  app,
  BrowserWindow,
  WebContentsView,
  ipcMain,
  globalShortcut,
  IpcMainEvent,
  IpcMainInvokeEvent,
} from "electron";
import path from "path";
import { ViewManager } from "./services/ViewManager";
import { viteConfig } from "./config/vite";
import { AppOverlay } from "./services/AppOverlay";
import { SlashCommandManager } from "./services/SlashCommandManager";
import { LinkInterceptionService } from "./services/LinkInterceptionService";
import { log } from "./utils/mainLogger";
import { shouldOpenDevTools } from "./config/development";
import { ViewLayerManager, ViewLayer } from "./services/ViewLayerManager";
import { welcomeContent } from "./content/welcomeContent";
import { DatabaseManager } from "./database/DatabaseManager";
import { Container } from "./services/Container";
import {
  registerServices,
  initializeAllServices,
  getServices,
} from "./services/ServiceRegistry";

if (require("electron-squirrel-startup")) {
  app.quit();
}

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
  },
} as const;

// Global references to keep objects from being garbage collected
let globalAppView: WebContentsView | null = null;
// Global service container
const serviceContainer = new Container();

const createWindow = async () => {
  // Register all services with their dependencies
  registerServices(serviceContainer);

  // Initialize all services in dependency order
  try {
    await initializeAllServices(serviceContainer);
    log.debug("All services initialized successfully", "main");
  } catch (error) {
    log.debug(`Service initialization failed: ${error}`, "main");
    throw error;
  }

  // Get service instances
  const services = getServices(serviceContainer);
  const { blockEventManager, documentManager } = services;
  const baseWindow = new BrowserWindow({
    width: 1400,
    height: 900,
  });

  const appViewInstance = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, `preload.js`),
      // Security best practices for Electron
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false, // Need to disable sandbox to use contextBridge
      webSecurity: true,
      allowRunningInsecureContent: false,
      // Use a separate session for the main app UI (not shared with browser blocks)
      partition: "persist:main-app",
    },
  });

  // Helper function to update view bounds to match window size
  const updateViewBounds = () => {
    const bounds = baseWindow.getBounds();
    appViewInstance.setBounds({ x: 0, y: 0, width: bounds.width, height: bounds.height });
  };

  // Set initial bounds to match window size
  updateViewBounds();

  // Set Content-Security-Policy for the main app
  // Since the main app uses a separate session, this won't affect browser blocks
  appViewInstance.webContents.session.webRequest.onHeadersReceived(
    (
      details: { responseHeaders?: Record<string, string[]> },
      callback: (response: {
        responseHeaders: Record<string, string[]>;
      }) => void
    ) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          "Content-Security-Policy": [
            "default-src 'self'; " +
              "script-src 'self' 'unsafe-inline'; " + // Allow inline scripts for development
              "style-src 'self' 'unsafe-inline'; " + // Allow inline styles
              "connect-src 'self' https://example.com; " + // Allow connections to example.com
              "img-src 'self' data: https:; " + // Allow images from https and data URLs
              "font-src 'self' data:;", // Allow fonts from data URLs
          ],
        },
      });
    }
  );

  baseWindow.contentView.addChildView(appViewInstance);

  if (viteConfig.mainWindow.devServerUrl) {
    appViewInstance.webContents.loadURL(viteConfig.mainWindow.devServerUrl);
  } else {
    appViewInstance.webContents.loadFile(
      path.join(
        __dirname,
        `../renderer/${viteConfig.mainWindow.name}/index.html`
      )
    );
  }

  // Open devtools for main window if configured
  if (shouldOpenDevTools("openMainWindow")) {
    const devTools = new BrowserWindow();
    appViewInstance.webContents.setDevToolsWebContents(devTools.webContents);
    appViewInstance.webContents.openDevTools({ mode: "detach" });
  }

  // Store global references
  globalAppView = appViewInstance;

  // Create the view layer manager for proper z-ordering
  const viewLayerManager = new ViewLayerManager(baseWindow);

  // Register the main app view with the layer manager
  viewLayerManager.addView("main-app", appViewInstance, ViewLayer.BACKGROUND);

  // Set up link interception for the main renderer process
  const linkInterceptionService = new LinkInterceptionService(appViewInstance);

  const viewManager = new ViewManager(
    baseWindow,
    viewLayerManager,
    appViewInstance.webContents
  );
  const appOverlay = new AppOverlay({}, baseWindow, globalAppView);
  const slashCommandManager = new SlashCommandManager(
    appOverlay,
    globalAppView
  );

  // Set up the link click callback for ViewManager to properly target the correct WebContents
  viewManager.setLinkClickCallback((url: string) => {
    log.debug(`Link click callback called with URL: ${url}`, "main");

    // Forward the new block event to the main renderer (appView, not mainWindow)
    if (globalAppView && !globalAppView.webContents.isDestroyed()) {
      log.debug(`Forwarding new block event to appView: ${url}`, "main");
      globalAppView.webContents.send(EVENTS.BROWSER.NEW_BLOCK, { url });
    } else {
      log.debug(
        "Cannot forward new block event - appView not available",
        "main"
      );
    }
  });

  // Set up the link click callback for LinkInterceptionService
  linkInterceptionService.setLinkClickCallback((url: string) => {
    log.debug(
      `Main renderer link click callback called with URL: ${url}`,
      "main"
    );

    // Forward the new block event to the main renderer
    if (globalAppView && !globalAppView.webContents.isDestroyed()) {
      log.debug(
        `Forwarding new block event from main renderer to appView: ${url}`,
        "main"
      );
      globalAppView.webContents.send(EVENTS.BROWSER.NEW_BLOCK, { url });
    } else {
      log.debug(
        "Cannot forward new block event from main renderer - appView not available",
        "main"
      );
    }
  });

  // Store global references (baseWindow and viewManager are kept alive by their usage)

  // Set up console log forwarding from renderer
  setupConsoleLogForwarding(appViewInstance);

  // Attach renderer web contents to the active document's block service
  const attachRendererToActiveDocument = () => {
    const activeDocument = documentManager.activeDocument;
    if (!activeDocument) {
      log.debug(
        "No active document available to attach renderer",
        "main"
      );
      return;
    }

    const blockService = documentManager.getBlockService(activeDocument.id);
    blockService.setRendererWebContents(appViewInstance);
  };

  attachRendererToActiveDocument();

  services.debugEventService.setMainRendererWebContents(appViewInstance);
  blockEventManager.setRendererWebContents(appViewInstance);

  // Document loading/seeding will happen when renderer signals it's ready
  // This prevents race condition where Y.js updates are broadcast before renderer can receive them

  // Set up IPC handlers (including renderer-ready handler)
  setupIpcHandlers(viewManager, slashCommandManager, services, appViewInstance);

  // Update view bounds when window is resized
  baseWindow.on("resize", updateViewBounds);

  baseWindow.on("closed", () => {
    globalAppView = null;
  });
};

const setupConsoleLogForwarding = (webContentsView: WebContentsView) => {
  // Forward renderer console logs to main process
  webContentsView.webContents.on(
    "console-message",
    (
      _event: unknown,
      level: number,
      message: string,
      line: number,
      sourceId: string
    ) => {
      const logLevel =
        level === 1
          ? "info"
          : level === 2
          ? "warn"
          : level === 3
          ? "error"
          : "debug";
      const source = sourceId ? path.basename(sourceId) : "renderer";

      log.debug(
        `[RENDERER-${logLevel.toUpperCase()}] ${source}:${line} - ${message}`,
        "renderer-console"
      );
    }
  );

  // Also capture renderer errors
  webContentsView.webContents.on(
    "render-process-gone",
    (_event: unknown, details: { reason: string; exitCode: number }) => {
      log.debug(
        `Renderer process gone. Reason: ${details.reason}, Exit code: ${details.exitCode}`,
        "renderer-crash"
      );
    }
  );

  webContentsView.webContents.on("unresponsive", () => {
    log.debug("Renderer process became unresponsive", "renderer-unresponsive");
  });

  webContentsView.webContents.on("responsive", () => {
    log.debug(
      "Renderer process became responsive again",
      "renderer-responsive"
    );
  });
};

const setupIpcHandlers = (
  viewManager: ViewManager,
  slashCommandManager: SlashCommandManager,
  services: ReturnType<typeof getServices>,
  rendererView: WebContentsView
) => {
  const { documentManager, profileManager } = services;

  const sendToRenderer = (channel: string, payload: any) => {
    if (
      rendererView.webContents.isDestroyed() ||
      rendererView.webContents === null
    ) {
      return;
    }
    rendererView.webContents.send(channel, payload);
  };

  const broadcastDocumentTree = (profileId: string | null) => {
    if (!profileId) return;
    const tree = documentManager.getDocumentTree(profileId);
    sendToRenderer("document-tree:updated", { profileId, tree });
  };

  const broadcastProfiles = () => {
    const profiles = profileManager.listProfiles();
    sendToRenderer("profiles:updated", { profiles });
  };

  const broadcastActiveDocument = () => {
    const activeDocument = documentManager.activeDocument;
    sendToRenderer("document:switched", { document: activeDocument });
  };

  const loadDocumentIntoRenderer = async (
    documentId: string,
    { seedIfEmpty = false }: { seedIfEmpty?: boolean } = {}
  ) => {
    const blockService = documentManager.getBlockService(documentId);
    blockService.setRendererWebContents(rendererView);

    const blocks = await blockService.loadDocument();
    if (seedIfEmpty && blocks.length === 0) {
      await blockService.seedInitialContent(welcomeContent);
    }
  };
  // Handle renderer ready signal - load/seed document only after renderer is ready
  ipcMain.on("renderer-ready", async () => {
    log.debug("Renderer ready signal received - loading document", "main");

    const activeDocument =
      documentManager.activeDocument ?? documentManager.listDocuments()[0];

    if (!activeDocument) {
      log.debug("No document available to load", "main");
      return;
    }

    try {
      await loadDocumentIntoRenderer(activeDocument.id, { seedIfEmpty: true });
      log.debug("Document loaded - Y.js will sync to renderer", "main");
    } catch (error) {
      log.debug(`Error loading document: ${error}`, "main");
    }

    broadcastProfiles();
    broadcastDocumentTree(activeDocument.profileId);
    broadcastActiveDocument();
  });

  // Handle browser updates
  ipcMain.on("update-browser", (_, _browserLayout) => {
    log.debug(`Received update-browser event`, "main");
    // Migrate to unified event: you must provide both url and bounds here
    // Example: viewManager.handleBlockViewUpdate({ blockId, url, bounds })
    // If browserLayout does not have url, you need to refactor the caller to provide it
  });

  // Handle browser removal
  ipcMain.on("remove-browser", (_, blockId) => {
    log.debug(`Received remove-browser event for block ${blockId}`, "main");
    viewManager.handleRemoveView(blockId);
  });

  ipcMain.handle("browser:get-devtools-state", (_, blockId: string) => {
    log.debug(
      `Received browser:get-devtools-state request for block ${blockId}`,
      "main"
    );
    return viewManager.getDevToolsState(blockId);
  });

  ipcMain.handle("browser:toggle-devtools", (_, blockId: string) => {
    log.debug(
      `Received browser:toggle-devtools request for block ${blockId}`,
      "main"
    );
    return viewManager.toggleDevTools(blockId);
  });

  ipcMain.handle("browser:go-back", async (_, blockId: string) => {
    log.debug(
      `Received browser:go-back request for block ${blockId}`,
      "main"
    );
    return viewManager.goBack(blockId);
  });

  // Handle slash command events through the new state manager
  ipcMain.on("slash-command:start", () => {
    log.debug("Slash command start event received", "main");
    slashCommandManager.startSlashCommand();
  });

  ipcMain.on("slash-command:cancel", () => {
    log.debug("Slash command cancel event received", "main");
    slashCommandManager.cancelSlashCommand();
  });

  ipcMain.on(
    "slash-command:update-results",
    (_event, payload: import("./types/slashCommand").SlashCommandResultsPayload) => {
      log.debug(
        `Slash command results update received (items: ${payload.items.length}, selected: ${payload.selectedIndex})`,
        "main",
      );
      slashCommandManager.updateResults(payload);
    },
  );

  ipcMain.on("slash-command:overlay-ready", () => {
    log.debug("Slash command overlay ready event received", "main");
    slashCommandManager.handleOverlayReady();
  });

  // Handle block selection from HUD through the state manager
  ipcMain.on("block-menu:select", (_, blockKey) => {
    log.debug(`Block selected from HUD: ${blockKey}`, "main");
    slashCommandManager.selectBlock(blockKey);
  });

  // Handle renderer log forwarding
  ipcMain.on(
    "renderer-log",
    (
      _event: IpcMainEvent,
      logData: {
        level: string;
        message: string;
        timestamp: string;
        source: string;
      }
    ) => {
      const { level, message, source } = logData;
      const safeLevel = (level || "debug").toUpperCase();
      const safeMessage = message || "No message";
      const safeSource = source || "unknown";

      log.debug(
        `[RENDERER-${safeLevel}] ${safeSource} - ${safeMessage}`,
        "renderer-console"
      );
    }
  );

  // Handle block operations for unified processing with transaction metadata
  ipcMain.handle(
    "block-operations:apply",
    async (
      _event: IpcMainInvokeEvent,
      operations: unknown[],
      origin?: unknown
    ): Promise<unknown> => {
      try {
        log.debug(
          `IPC: Applying ${operations.length} block operations ${
            (origin as any)?.batchId
              ? `(batch: ${(origin as any).batchId})`
              : ""
          }`,
          "main"
        );

        // Get the BlockOperationService instance
        const activeDocument =
          documentManager.activeDocument ??
          documentManager.listDocuments()[0];
        if (!activeDocument) {
          throw new Error("No active document available for operations");
        }

        const blockOperationService =
          documentManager.getBlockService(activeDocument.id);

        // Set renderer web contents for updates
        if (globalAppView) {
          blockOperationService.setRendererWebContents(globalAppView);
        }

        // Apply operations with transaction metadata
        const result = await blockOperationService.applyOperations(
          operations as any,
          origin as any
        );

        log.debug(
          `IPC: Block operations result: ${
            result.operationsApplied
          } applied, success: ${result.success}${
            result.batchId ? `, batch: ${result.batchId}` : ""
          }`,
          "main"
        );

        return result;
      } catch (error) {
        log.debug(`IPC: Error applying block operations: ${error}`, "main");
        return {
          success: false,
          operationsApplied: 0,
          errors: [error instanceof Error ? error.message : "Unknown error"],
        };
      }
    }
  );

  // Unified handler for update-block-view
  ipcMain.on("update-browser-view", (_, data) => {
    log.debug(
      `Received update-browser-view event for block ${data.blockId}`,
      "main"
    );
    viewManager.handleBlockViewUpdate(data);
  });

  ipcMain.handle("profiles:list", () => {
    return profileManager.listProfiles();
  });

  ipcMain.handle(
    "profiles:create",
    (
      _event,
      payload: { name: string; icon?: string | null; color?: string | null }
    ) => {
      const profile = profileManager.createProfile(payload.name, {
        icon: payload.icon ?? null,
        color: payload.color ?? null,
      });
      broadcastProfiles();
      broadcastDocumentTree(profile.id);
      return profile;
    }
  );

  ipcMain.handle("profiles:delete", (_event, profileId: string) => {
    profileManager.deleteProfile(profileId);
    broadcastProfiles();
    return { success: true };
  });

  ipcMain.handle("documents:get-active", () => {
    return documentManager.activeDocument;
  });

  ipcMain.handle(
    "documents:get-tree",
    (_event, profileId?: string | null) => {
      const resolvedProfileId =
        profileId ??
        documentManager.activeDocument?.profileId ??
        profileManager.listProfiles()[0]?.id ??
        null;

      if (!resolvedProfileId) return [];
      return documentManager.getDocumentTree(resolvedProfileId);
    }
  );

  ipcMain.handle(
    "documents:create",
    (
      _event,
      payload: {
        profileId: string;
        title?: string | null;
        parentDocumentId?: string | null;
        position?: number;
      }
    ) => {
      const document = documentManager.createDocument(
        payload.profileId,
        payload.title,
        {
          parentDocumentId: payload.parentDocumentId ?? null,
          position: payload.position,
        }
      );

      broadcastDocumentTree(payload.profileId);
      return document;
    }
  );

  ipcMain.handle(
    "documents:rename",
    (_event, payload: { documentId: string; title: string }) => {
      const updated = documentManager.renameDocument(
        payload.documentId,
        payload.title
      );
      broadcastDocumentTree(updated.profileId);
      broadcastActiveDocument();
      return updated;
    }
  );

  ipcMain.handle(
    "documents:delete",
    async (_event, documentId: string) => {
      const document = documentManager.getDocument(documentId);
      await documentManager.deleteDocument(documentId);
      broadcastDocumentTree(document.profileId);
      broadcastActiveDocument();
      return { success: true };
    }
  );

  ipcMain.handle(
    "documents:move",
    (
      _event,
      payload: { documentId: string; newParentId: string | null; position: number }
    ) => {
      const updated = documentManager.moveDocument(
        payload.documentId,
        payload.newParentId,
        payload.position
      );
      broadcastDocumentTree(updated.profileId);
      return updated;
    }
  );

  ipcMain.handle(
    "documents:move-to-profile",
    (_event, payload: { documentId: string; newProfileId: string }) => {
      const current = documentManager.getDocument(payload.documentId);
      const updated = documentManager.moveDocumentToProfile(
        payload.documentId,
        payload.newProfileId
      );
      broadcastDocumentTree(current.profileId);
      broadcastDocumentTree(updated.profileId);
      broadcastActiveDocument();
      return updated;
    }
  );

  ipcMain.handle(
    "documents:switch",
    async (_event, documentId: string) => {
      const document = documentManager.switchDocument(documentId);

      await loadDocumentIntoRenderer(documentId);
      broadcastDocumentTree(document.profileId);
      broadcastActiveDocument();

      return document;
    }
  );
};

app.on("ready", async () => {
  log.debug("App ready, creating window and setting up services", "main");
  try {
    await createWindow();
  } catch (error) {
    log.debug(`Failed to create window: ${error}`, "main");
    app.quit();
  }
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", async () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    try {
      await createWindow();
    } catch (error) {
      log.debug(`Failed to create window on activate: ${error}`, "main");
    }
  }
});

// Clean up global shortcuts when quitting
app.on("will-quit", () => {
  globalShortcut.unregisterAll();

  // Close database connection
  try {
    const dbManager = DatabaseManager.getInstance();
    if (dbManager.initialized) {
      dbManager.close();
      log.debug("Database connection closed", "main");
    }
  } catch (error) {
    // Database might not be initialized if app is closing early
    log.debug(`Database cleanup error: ${error}`, "main");
  }
});
