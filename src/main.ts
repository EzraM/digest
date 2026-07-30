import {
  app,
  BrowserWindow,
  WebContentsView,
  globalShortcut,
  session,
} from "electron";
import path from "path";
import { WindowPresentationStore } from "./services/WindowPresentationStore";
import { viteConfig } from "./config/vite";
import { LinkInterceptionService } from "./services/LinkInterceptionService";
import { log } from "./utils/mainLogger";
import { shouldOpenDevTools } from "./config/development";
import { ViewLayerManager, ViewLayer } from "./services/ViewLayerManager";
import { DatabaseManager } from "./database/DatabaseManager";
import { IPCRouter } from "./ipc/IPCRouter";
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
import { ApplicationJourneyAllocator } from "./services/ApplicationJourneyAllocator";
import { HandleRegistry } from "./domains/browser-views/adapter/HandleRegistry";
import { CollaborationDocumentService } from "./application/CollaborationDocumentService";
import { registerIpcHandlers } from "./ipc/registerIpcHandlers";
import { createApplicationServices } from "./application/ApplicationServices";
import { configureElectron } from "./electron/configureElectron";
import { setupRendererLogging } from "./electron/setupRendererLogging";

if (require("electron-squirrel-startup")) {
  app.quit();
}

configureElectron();

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
const applicationServices = createApplicationServices();
const windowRegistry = new WindowRegistry();
const placementRegistry = new PlacementRegistry();
const viewStoreByRendererId = new Map<number, WindowPresentationStore>();
const placementIdByRendererId = new Map<number, string>();
const sharedJourneys = new BrowsingJourneyStore(10);
const sharedHandles = new HandleRegistry();
const journeyAllocator = new ApplicationJourneyAllocator({
  journeys: sharedJourneys,
  handles: sharedHandles,
});
let collaborationDocuments: CollaborationDocumentService | undefined;
const ipcRouter = new IPCRouter();
let ipcInitialized = false;
let sharedIpcServicesExposed = false;
let imageProtocolInitialized = false;

const createWindow = async (
  initialHash?: string,
  initialDocumentId: string | null = null
) => {
  const initialized = await applicationServices.initialize();
  const { services } = initialized;
  collaborationDocuments = initialized.collaborationDocuments;
  const { documentManager } = services;
  const selectedDocumentId = initialDocumentId
    ? documentManager.getDocument(initialDocumentId).id
    : null;
  const ipcServiceBridge = new IPCServiceBridge(
    ipcRouter,
    applicationServices.container
  );
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
    selectedDocumentId,
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

  const viewStore = new WindowPresentationStore(
    baseWindow,
    viewLayerManager,
    appViewInstance.webContents,
    new LivePageCacheTelemetry(services.database as Database.Database),
    {
      handles: journeyAllocator.getHandleRegistry(),
      resolvePresentationIdentity: (handleId) =>
        journeyAllocator.getActiveMappingForHandle(handleId),
      resolveHandleIdForPlacement: (placementId) =>
        journeyAllocator.getHandleIdForPlacement(placementId),
      onRendererGone: (handleId) => {
        const placementId = journeyAllocator.getActivePlacementId(handleId);
        journeyAllocator.removeJourney(handleId);
        return placementId;
      },
      onNavigation: (handleId, url, historyIndex) =>
        journeyAllocator.recordNavigation(handleId, url, historyIndex),
      publishLivePages: () => {
        journeyAllocator.syncLivePages();
      },
      subscribeLivePages: (listener) =>
        journeyAllocator.subscribeLivePages(listener),
    }
  );
  viewStoreByRendererId.set(appViewInstance.webContents.id, viewStore);
  // A renderer `_blank` request means another Digest window. Preserve the
  // originating document as explicit return context on the URL route.
  const openUrlInDigestWindow = async (url: string) => {
    const currentHash = await appViewInstance.webContents
      .executeJavaScript("window.location.hash")
      .catch(() => "");
    const currentRoute = String(currentHash);
    const documentMatch = currentRoute.match(/#\/doc\/([^?]+)/);
    const routeSearch = new URLSearchParams(currentRoute.split("?")[1] ?? "");
    const documentId = documentMatch?.[1]
      ? decodeURIComponent(documentMatch[1])
      : routeSearch.get("doc");
    const queryParams = new URLSearchParams();
    if (documentId) queryParams.set("doc", documentId);
    const sourceBlockId = routeSearch.get("source");
    const fallbackLinkLabel = routeSearch.get("label");
    if (sourceBlockId) queryParams.set("source", sourceBlockId);
    if (fallbackLinkLabel) queryParams.set("label", fallbackLinkLabel.slice(0, 240));
    const query = queryParams.size ? `?${queryParams.toString()}` : "";
    await createWindow(
      `#/url/${encodeURIComponent(url)}${query}`,
      documentId
    );
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
      id: info.id,
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

  // Set up background link click callback for WindowPresentationStore (page context - inserts inline links)
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
  setupRendererLogging(appViewInstance);

  services.debugEventService.setMainRendererWebContents(appViewInstance);

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

  // Set up process-wide IPC handlers.
  if (!ipcInitialized) {
    registerIpcHandlers({
      router: ipcRouter,
      services,
      downloadManager,
      collaborationDocuments: collaborationDocuments!,
      journeyAllocator,
      placementRegistry,
      windowRegistry,
      viewStoreByRendererId,
      placementIdByRendererId,
      openWindow: createWindow,
    });
    ipcInitialized = true;
  }

  // Update view bounds when window is resized
  baseWindow.on("resize", updateViewBounds);

  baseWindow.on("closed", () => {
    const rendererId = appViewInstance.webContents.id;
    viewStore.dispose();
    viewStoreByRendererId.delete(rendererId);
    collaborationDocuments?.unsubscribe(rendererId);
    placementIdByRendererId.delete(rendererId);
    placementRegistry.retireWindow(windowId);
    windowRegistry.retire(windowId);
    if (globalAppView === appViewInstance) {
      globalAppView = windowRegistry.list()[0]?.rendererView ?? null;
    }
  });
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
  applicationServices.dispose();

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
