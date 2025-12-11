import {
  app,
  BrowserWindow,
  WebContentsView,
  globalShortcut,
  protocol,
  session,
} from "electron";
import path from "path";
import { ViewStore } from "./services/ViewStore";
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
import { IPCRouter, IPCHandlerMap } from "./ipc/IPCRouter";
import { createProfileHandlers } from "./ipc/handlers/profileHandlers";
import { createDocumentHandlers } from "./ipc/handlers/documentHandlers";
import { createSlashCommandHandlers } from "./ipc/handlers/slashCommandHandlers";
import { createRendererHandlers } from "./ipc/handlers/rendererHandlers";
import { createBrowserHandlers } from "./ipc/handlers/browserHandlers";
import { createBlockHandlers } from "./ipc/handlers/blockHandlers";
import { IPCServiceBridge } from "./services/IPCServiceBridge";
import { ImageProtocolService } from "./services/ImageProtocolService";

if (require("electron-squirrel-startup")) {
  app.quit();
}

// Register custom protocol scheme before app is ready
// This must be called before app.on("ready")
protocol.registerSchemesAsPrivileged([
  {
    scheme: "digest-image",
    privileges: {
      bypassCSP: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);

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
  const ipcRouter = new IPCRouter();
  const ipcServiceBridge = new IPCServiceBridge(ipcRouter, serviceContainer);
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

  // Helper function to update view bounds to match the window's content area (not the frame)
  const updateViewBounds = () => {
    const { width, height } = baseWindow.getContentBounds();
    appViewInstance.setBounds({ x: 0, y: 0, width, height });
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
              "img-src 'self' data: https: digest-image: blob:; " + // Allow images from https, data URLs, custom protocol, and blob URLs
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

  const viewStore = new ViewStore(
    baseWindow,
    viewLayerManager,
    appViewInstance.webContents
  );
  const appOverlay = new AppOverlay({}, baseWindow, globalAppView);
  const slashCommandManager = new SlashCommandManager(
    appOverlay,
    globalAppView
  );

  // Shared helper to create a new browser block
  const createBrowserBlock = (url: string, sourceBlockId?: string) => {
    log.debug(
      `Creating new browser block: ${url}, sourceBlockId: ${sourceBlockId}`,
      "main"
    );

    if (globalAppView && !globalAppView.webContents.isDestroyed()) {
      globalAppView.webContents.send(EVENTS.BROWSER.NEW_BLOCK, {
        url,
        sourceBlockId,
      });
    } else {
      log.debug("Cannot create browser block - appView not available", "main");
    }
  };

  // Set up the link click callback for ViewStore to properly target the correct WebContents
  viewStore.setLinkClickCallback(createBrowserBlock);

  // Set up the link click callback for LinkInterceptionService
  linkInterceptionService.setLinkClickCallback(createBrowserBlock);

  // Store global references (baseWindow and viewManager are kept alive by their usage)

  // Set up console log forwarding from renderer
  setupConsoleLogForwarding(appViewInstance);

  // Attach renderer web contents to the active document's block service
  const attachRendererToActiveDocument = () => {
    const activeDocument = documentManager.activeDocument;
    if (!activeDocument) {
      log.debug("No active document available to attach renderer", "main");
      return;
    }

    const blockService = documentManager.getBlockService(activeDocument.id);
    blockService.setRendererWebContents(appViewInstance);
  };

  attachRendererToActiveDocument();

  services.debugEventService.setMainRendererWebContents(appViewInstance);
  blockEventManager.setRendererWebContents(appViewInstance);

  ipcServiceBridge.exposeService(
    "profileManager",
    [{ method: "listProfiles", alias: "list" }],
    "profiles"
  );

  // Expose ImageService methods
  ipcServiceBridge.exposeService(
    "imageService",
    [
      { method: "saveImage", alias: "saveImage" },
      { method: "getImageInfo", alias: "getImageInfo" },
    ],
    "image"
  );

  // Initialize and register the image protocol handler
  // Register on the session used by the renderer (not the default protocol)
  const rendererSession = session.fromPartition("persist:main-app");
  const imageProtocolService = ImageProtocolService.getInstance();
  imageProtocolService.initialize(
    services.imageService,
    rendererSession.protocol
  );

  // Document loading/seeding will happen when renderer signals it's ready
  // This prevents race condition where Y.js updates are broadcast before renderer can receive them

  // Set up IPC handlers (including renderer-ready handler)
  setupIpcHandlers(
    ipcRouter,
    viewStore,
    slashCommandManager,
    services,
    appViewInstance,
    createBrowserBlock
  );

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
  router: IPCRouter,
  viewStore: ViewStore,
  slashCommandManager: SlashCommandManager,
  services: ReturnType<typeof getServices>,
  rendererView: WebContentsView,
  createBrowserBlock: (url: string, sourceBlockId?: string) => void
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

    // Create snapshot when page is opened to avoid jank on reopen
    await blockService.createSnapshot();
  };

  const loadInitialDocument = async () => {
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
  };

  const resolveProfileId = () => profileManager.listProfiles()[0]?.id ?? null;

  const registerMap = (handlers: IPCHandlerMap) => {
    Object.entries(handlers).forEach(([channel, handler]) =>
      router.register(channel, handler)
    );
  };

  registerMap(
    createRendererHandlers({
      loadInitialDocument,
      broadcastProfiles,
      broadcastDocumentTree,
      broadcastActiveDocument,
      getActiveProfileId: () =>
        documentManager.activeDocument?.profileId ?? null,
    })
  );

  registerMap(createBrowserHandlers(viewStore, createBrowserBlock));
  registerMap(createSlashCommandHandlers(slashCommandManager));
  registerMap(
    createBlockHandlers(documentManager, rendererView, services.imageService)
  );
  registerMap(
    createProfileHandlers(
      profileManager,
      broadcastProfiles,
      broadcastDocumentTree
    )
  );
  registerMap(
    createDocumentHandlers(
      documentManager,
      resolveProfileId,
      broadcastDocumentTree,
      broadcastActiveDocument,
      loadDocumentIntoRenderer
    )
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
