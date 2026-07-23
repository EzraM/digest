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
import { createRendererHandlers } from "./ipc/handlers/rendererHandlers";
import { createBrowserHandlers } from "./ipc/handlers/browserHandlers";
import { createBlockHandlers } from "./ipc/handlers/blockHandlers";
import { createSearchHandlers } from "./ipc/handlers/searchHandlers";
import { createDownloadHandlers } from "./ipc/handlers/downloadHandlers";
import { IPCServiceBridge } from "./services/IPCServiceBridge";
import { ImageProtocolService } from "./services/ImageProtocolService";
import { fetchPageTitle } from "./domains/link-capture/adapter/fetchPageTitle";
import { DownloadManager } from "./services/DownloadManager";
import Database from "better-sqlite3";
import { LivePageCacheTelemetry } from "./services/LivePageCacheTelemetry";
import { randomUUID } from "node:crypto";
import { WindowRegistry } from "./application/WindowRegistry";
import { PlacementRegistry } from "./application/PlacementRegistry";
import { BrowsingJourneyStore } from "./services/BrowsingJourneyStore";
import { HandleRegistry } from "./domains/browser-views/adapter/HandleRegistry";
import { DocumentEditRegistry } from "./application/DocumentEditRegistry";

if (require("electron-squirrel-startup")) {
  app.quit();
}

// Opt-in Chrome DevTools Protocol access for local performance diagnostics.
// Keep this disabled during normal runs because the endpoint can control the app.
const remoteDebuggingPort = process.env.DIGEST_REMOTE_DEBUGGING_PORT;
if (remoteDebuggingPort) {
  if (!/^\d+$/.test(remoteDebuggingPort)) {
    throw new Error("DIGEST_REMOTE_DEBUGGING_PORT must be a numeric port");
  }
  app.commandLine.appendSwitch(
    "remote-debugging-address",
    "127.0.0.1"
  );
  app.commandLine.appendSwitch("remote-debugging-port", remoteDebuggingPort);
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
    INSERT_LINK: "browser:insert-link",
    LINK_CAPTURED: "browser:link-captured",
    IMAGE_CLIPPED: "browser:image-clipped",
    NAVIGATION: "browser:navigation-state",
  },
  DOWNLOAD: {
    STARTED: "download:started",
    PROGRESS: "download:progress",
    COMPLETED: "download:completed",
    FAILED: "download:failed",
  },
} as const;

// Global references to keep objects from being garbage collected
let globalAppView: WebContentsView | null = null;
// Global service container
const serviceContainer = new Container();
const windowRegistry = new WindowRegistry();
const placementRegistry = new PlacementRegistry();
const viewStoreByRendererId = new Map<number, ViewStore>();
const placementIdByRendererId = new Map<number, string>();
const sharedJourneys = new BrowsingJourneyStore(10);
const sharedHandles = new HandleRegistry();
const documentEditRegistry = new DocumentEditRegistry();
const ipcRouter = new IPCRouter();
let applicationServices: ReturnType<typeof getServices> | undefined;
let applicationInitialization: Promise<ReturnType<typeof getServices>> | undefined;
let ipcInitialized = false;
let sharedIpcServicesExposed = false;
let imageProtocolInitialized = false;

const initializeApplication = () => {
  if (applicationInitialization) return applicationInitialization;
  applicationInitialization = (async () => {
    registerServices(serviceContainer);
    await initializeAllServices(serviceContainer);
    applicationServices = getServices(serviceContainer);
    log.debug("Application services initialized", "main");
    return applicationServices;
  })();
  return applicationInitialization;
};

const createWindow = async (initialHash?: string) => {
  const services = await initializeApplication();
  const { blockEventManager, documentManager } = services;
  const ipcServiceBridge = new IPCServiceBridge(ipcRouter, serviceContainer);
  const windowId = `window-${randomUUID()}`;
  const baseWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    // Let the renderer use the title-bar area on macOS while retaining the
    // native traffic-light controls in their standard inset position.
    ...(process.platform === "darwin"
      ? { titleBarStyle: "hiddenInset" as const }
      : {}),
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
  windowRegistry.register({
    windowId,
    browserWindow: baseWindow,
    rendererView: appViewInstance,
  });
  const placement = placementRegistry.register(
    windowId,
    appViewInstance.webContents.id
  );
  placementIdByRendererId.set(
    appViewInstance.webContents.id,
    placement.placementId
  );

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
    appViewInstance.webContents.loadURL(
      `${viteConfig.mainWindow.devServerUrl}${initialHash ?? ""}`
    );
  } else {
    appViewInstance.webContents.loadFile(
      path.join(__dirname, `../renderer/${viteConfig.mainWindow.name}/index.html`),
      initialHash ? { hash: initialHash.replace(/^#/, "") } : undefined
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
    appViewInstance.webContents,
    new LivePageCacheTelemetry(services.database as Database.Database),
    { journeys: sharedJourneys, handles: sharedHandles }
  );
  viewStoreByRendererId.set(appViewInstance.webContents.id, viewStore);
  // A renderer `_blank` request means another Digest window. Preserve the
  // originating document as explicit return context on the URL route.
  const openUrlInDigestWindow = async (url: string) => {
    const currentHash = await appViewInstance.webContents
      .executeJavaScript("window.location.hash")
      .catch(() => "");
    const documentMatch = String(currentHash).match(
      /#\/(?:doc\/([^?]+)|(?:block|url)\/[^?]+\?[^#]*\bdoc=([^&#]+))/
    );
    const documentId = documentMatch?.[1] ?? documentMatch?.[2];
    const query = documentId
      ? `?doc=${encodeURIComponent(decodeURIComponent(documentId))}`
      : "";
    await createWindow(`#/url/${encodeURIComponent(url)}${query}`);
  };

  // Helper to insert inline link (used by EventTranslator for page background clicks)
  const insertInlineLink = async (
    url: string,
    sourceBlockId: string,
    _unusedTitle: string,
    profileId: string
  ) => {
    // Fetch the title from the target URL (not the source page) using the source profile's session
    const title = await fetchPageTitle(url, { profileId });
    log.debug(`[main] Title fetched: "${title}"`, "main");

    if (globalAppView && !globalAppView.webContents.isDestroyed()) {
      globalAppView.webContents.send(EVENTS.BROWSER.INSERT_LINK, {
        url,
        title,
        sourceBlockId,
      });

      // Emit link capture notification event for UI feedback
      globalAppView.webContents.send(EVENTS.BROWSER.LINK_CAPTURED, {
        url,
        title,
        capturedAt: Date.now(),
      });
    }
  };

  // Set up download manager for browser block file downloads
  const downloadManager = new DownloadManager();
  downloadManager.recoverFromCrash();

  const sendToApp = (channel: string, payload: any) => {
    if (globalAppView && !globalAppView.webContents.isDestroyed()) {
      globalAppView.webContents.send(channel, payload);
    }
  };

  downloadManager.setOnStarted((info) => {
    sendToApp(EVENTS.DOWNLOAD.STARTED, {
      id: info.id,
      fileName: info.fileName,
      url: info.url,
      totalBytes: info.totalBytes,
      savePath: info.savePath,
    });
  });

  downloadManager.setOnProgress((info) => {
    sendToApp(EVENTS.DOWNLOAD.PROGRESS, {
      id: info.id,
      receivedBytes: info.receivedBytes,
      totalBytes: info.totalBytes,
    });
  });

  downloadManager.setOnCompleted((info) => {
    sendToApp(EVENTS.DOWNLOAD.COMPLETED, {
      id: info.id,
      savePath: info.savePath,
      fileName: info.fileName,
    });

    // Also send a file block insertion event so the renderer can add a file block at cursor
    sendToApp("download:insert-file-block", {
      fileName: info.fileName,
      savePath: info.savePath,
      url: info.url,
    });
  });

  downloadManager.setOnFailed((info) => {
    sendToApp(EVENTS.DOWNLOAD.FAILED, {
      id: info.id,
      status: info.status,
    });
  });

  // Pass download manager to view store so it can attach to browser block sessions
  viewStore.setDownloadManager(downloadManager);

  // Set up background link click callback for ViewStore (page context - inserts inline links)
  viewStore.setBackgroundLinkClickCallback(insertInlineLink);

  viewStore.setImageContextCallback(async ({
    blockId,
    webContents,
    imageUrl,
    altText,
    width,
    height,
  }) => {
    const sourceUrl = webContents.getURL();
    const sourceTitle = webContents.getTitle() || sourceUrl;

    const saved = await services.imageService.downloadAndSaveImage({
      url: imageUrl,
      width,
      height,
      session: webContents.session,
    });

    if (!saved) {
      log.debug(`Failed to save clipped image: ${imageUrl}`, "main");
      return;
    }

    if (globalAppView && !globalAppView.webContents.isDestroyed()) {
      globalAppView.webContents.send(EVENTS.BROWSER.IMAGE_CLIPPED, {
        blockId,
        sourceUrl,
        sourceTitle,
        originalImageUrl: imageUrl,
        altText: altText || "",
        imageId: saved.id,
        localImageUrl: saved.url,
        width: saved.width,
        height: saved.height,
        capturedAt: Date.now(),
      });
    }
  });

  // Set up the link click callback for LinkInterceptionService (notebook context - navigates to URL)
  linkInterceptionService.setLinkClickCallback((url) => {
    void openUrlInDigestWindow(url);
  });

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

  if (!sharedIpcServicesExposed) {
    ipcServiceBridge.exposeService(
      "profileManager",
      [{ method: "listProfiles", alias: "list" }],
      "profiles"
    );

    ipcServiceBridge.exposeService(
      "imageService",
      [
        { method: "saveImage", alias: "saveImage" },
        { method: "getImageInfo", alias: "getImageInfo" },
        { method: "downloadAndSaveImage", alias: "downloadAndSaveImage" },
        { method: "deleteImage", alias: "deleteImage" },
        { method: "attachImageToDocument", alias: "attachImageToDocument" },
      ],
      "image"
    );
    sharedIpcServicesExposed = true;
  }

  // Initialize and register the image protocol handler
  // Register on the session used by the renderer (not the default protocol)
  const rendererSession = session.fromPartition("persist:main-app");
  const imageProtocolService = ImageProtocolService.getInstance();
  if (!imageProtocolInitialized) {
    imageProtocolService.initialize(
      services.imageService,
      rendererSession.protocol
    );
    imageProtocolInitialized = true;
  }

  // Document loading/seeding will happen when renderer signals it's ready
  // This prevents race condition where Y.js updates are broadcast before renderer can receive them

  // Set up IPC handlers (including renderer-ready handler)
  if (!ipcInitialized) {
    setupIpcHandlers(
      ipcRouter,
      viewStore,
      services,
      appViewInstance,
      downloadManager
    );
    ipcInitialized = true;
  }

  // Update view bounds when window is resized
  baseWindow.on("resize", updateViewBounds);

  baseWindow.on("closed", () => {
    const rendererId = appViewInstance.webContents.id;
    viewStoreByRendererId.delete(rendererId);
    documentEditRegistry.releaseRenderer(rendererId);
    placementIdByRendererId.delete(rendererId);
    placementRegistry.retireWindow(windowId);
    windowRegistry.retire(windowId);
    if (globalAppView === appViewInstance) {
      globalAppView = windowRegistry.list()[0]?.rendererView ?? null;
    }
  });
};

const setupConsoleLogForwarding = (webContentsView: WebContentsView) => {
  // Forward renderer console logs to main process
  webContentsView.webContents.on(
    "console-message",
    ({ level, message, lineNumber, sourceId }) => {
      const logLevel =
        level === "info"
          ? "info"
          : level === "warning"
            ? "warn"
            : level === "error"
              ? "error"
              : "debug";
      const source = sourceId ? path.basename(sourceId) : "renderer";

      log.debug(
        `[RENDERER-${logLevel.toUpperCase()}] ${source}:${lineNumber} - ${message}`,
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
  services: ReturnType<typeof getServices>,
  rendererView: WebContentsView,
  downloadManager: DownloadManager
) => {
  const { documentManager, profileManager } = services;

  const sendToRenderer = (
    channel: string,
    payload: any,
    rendererId?: number
  ) => {
    const targets = rendererId
      ? windowRegistry
          .list()
          .filter((session) => session.rendererView.webContents.id === rendererId)
      : windowRegistry.list();
    for (const target of targets) {
      if (!target.rendererView.webContents.isDestroyed()) {
        target.rendererView.webContents.send(channel, payload);
      }
    }
  };

  const broadcastDocumentTree = (
    profileId: string | null,
    rendererId?: number
  ) => {
    if (!profileId) return;
    const tree = documentManager.getDocumentTree(profileId);
    sendToRenderer("document-tree:updated", { profileId, tree }, rendererId);
  };

  const broadcastProfiles = (rendererId?: number) => {
    const profiles = profileManager.listProfiles();
    sendToRenderer("profiles:updated", { profiles }, rendererId);
  };

  const broadcastActiveDocument = (rendererId?: number) => {
    const activeDocument = documentManager.activeDocument;
    sendToRenderer(
      "document:switched",
      { document: activeDocument },
      rendererId
    );
  };

  const loadDocumentIntoRenderer = async (
    documentId: string,
    { seedIfEmpty = false }: { seedIfEmpty?: boolean } = {},
    rendererId?: number
  ) => {
    const targetView = rendererId
      ? windowRegistry
          .list()
          .find((session) => session.rendererView.webContents.id === rendererId)
          ?.rendererView
      : rendererView;
    if (!targetView) throw new Error(`Unknown renderer: ${rendererId}`);
    const blockService = documentManager.getBlockService(documentId);
    documentEditRegistry.acquire(documentId, targetView.webContents.id);
    blockService.setRendererWebContents(targetView);

    const blocks = await blockService.loadDocument();
    if (seedIfEmpty && blocks.length === 0) {
      await blockService.seedInitialContent(welcomeContent);
    }

    // Create snapshot when page is opened to avoid jank on reopen
    await blockService.createSnapshot();
  };

  const loadInitialDocument = async (rendererId: number) => {
    log.debug("Renderer ready signal received - loading document", "main");
    const activeDocument =
      documentManager.activeDocument ?? documentManager.listDocuments()[0];

    if (!activeDocument) {
      log.debug("No document available to load", "main");
      return;
    }

    try {
      await loadDocumentIntoRenderer(
        activeDocument.id,
        { seedIfEmpty: true },
        rendererId
      );
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

  registerMap({
    "windows:open-route": {
      type: "invoke",
      fn: async (event, input: unknown) => {
        if (!windowRegistry.resolve(event.sender)) {
          throw new Error("Unknown Digest renderer");
        }
        if (!input || typeof input !== "object") {
          throw new Error("Invalid Digest window route");
        }
        const route = input as {
          kind?: unknown;
          url?: unknown;
          documentId?: unknown;
        };
        let hash: string;
        if (route.kind === "url" && typeof route.url === "string") {
          const documentQuery =
            typeof route.documentId === "string"
              ? `?doc=${encodeURIComponent(route.documentId)}`
              : "";
          hash = `#/url/${encodeURIComponent(route.url)}${documentQuery}`;
        } else if (
          route.kind === "doc" &&
          typeof route.documentId === "string"
        ) {
          hash = `#/doc/${encodeURIComponent(route.documentId)}`;
        } else {
          throw new Error("Invalid Digest window route");
        }
        const before = new Set(
          windowRegistry.list().map((session) => session.windowId)
        );
        await createWindow(hash);
        const created = windowRegistry
          .list()
          .find((session) => !before.has(session.windowId));
        return { windowId: created?.windowId ?? "" };
      },
    },
  });

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

  registerMap(
    createBrowserHandlers(
      (event) => {
        const store = viewStoreByRendererId.get(event.sender.id);
        if (!store) {
          throw new Error(`Unknown Digest renderer: ${event.sender.id}`);
        }
        return store;
      },
      (event) => {
        const placementId = placementIdByRendererId.get(event.sender.id);
        if (!placementId) {
          throw new Error(`No active placement for renderer: ${event.sender.id}`);
        }
        placementRegistry.requireOwnedActive(placementId, event.sender.id);
        return placementId;
      }
    )
  );
  registerMap(
    createBlockHandlers(
      documentManager,
      rendererView,
      services.blockOperationsApplier
      ,
      (rendererId) => windowRegistry.resolve({ id: rendererId } as any)?.windowId,
      (documentId, rendererId) =>
        documentEditRegistry.requireOwner(documentId, rendererId)
    )
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
  registerMap(
    createSearchHandlers(
      services.searchIndexManager,
      services.braveSearchService
    )
  );
  registerMap(createDownloadHandlers(downloadManager));
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
