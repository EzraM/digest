import { BrowserWindow, WebContentsView } from "electron";
import { WindowPresentationStore } from "../services/WindowPresentationStore";
import { LinkInterceptionService } from "../services/LinkInterceptionService";
import { log } from "../utils/mainLogger";
import { ViewLayerManager, ViewLayer } from "../services/ViewLayerManager";
import { fetchPageTitle } from "../domains/link-capture/adapter/fetchPageTitle";
import { DownloadManager } from "../services/DownloadManager";
import Database from "better-sqlite3";
import { LivePageCacheTelemetry } from "../services/LivePageCacheTelemetry";
import { randomUUID } from "node:crypto";
import { setupRendererLogging } from "../electron/setupRendererLogging";
import { createRendererWindow } from "../electron/createRendererWindow";
import { configureDownloads } from "./configureDownloads";
import { DigestProcess } from "./DigestProcess";

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
} as const;

// Global references to keep objects from being garbage collected
let globalAppView: WebContentsView | null = null;
const digestProcess = new DigestProcess();

export const openWindow = async (
  initialHash?: string,
  initialDocumentId: string | null = null
) => {
  const initialized = await digestProcess.initialize();
  const { services } = initialized;
  const { documentManager } = services;
  const selectedDocumentId = initialDocumentId
    ? documentManager.getDocument(initialDocumentId).id
    : null;
  const windowId = `window-${randomUUID()}`;
  const {
    browserWindow: baseWindow,
    rendererView: appViewInstance,
    updateBounds: updateViewBounds,
  } = createRendererWindow({ initialHash });
  digestProcess.windowRegistry.register({
    windowId,
    browserWindow: baseWindow,
    rendererView: appViewInstance,
    selectedDocumentId,
  });
  const placement = digestProcess.placementRegistry.register(
    windowId,
    appViewInstance.webContents.id
  );
  digestProcess.placementIdByRendererId.set(
    appViewInstance.webContents.id,
    placement.placementId
  );

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
      handles: digestProcess.journeyAllocator.getHandleRegistry(),
      resolvePresentationIdentity: (handleId) =>
        digestProcess.journeyAllocator.getActiveMappingForHandle(handleId),
      resolveHandleIdForPlacement: (placementId) =>
        digestProcess.journeyAllocator.getHandleIdForPlacement(placementId),
      onRendererGone: (handleId) => {
        const placementId =
          digestProcess.journeyAllocator.getActivePlacementId(handleId);
        digestProcess.journeyAllocator.removeJourney(handleId);
        return placementId;
      },
      onNavigation: (handleId, url, historyIndex) =>
        digestProcess.journeyAllocator.recordNavigation(
          handleId,
          url,
          historyIndex
        ),
      publishLivePages: () => {
        digestProcess.journeyAllocator.syncLivePages();
      },
      subscribeLivePages: (listener) =>
        digestProcess.journeyAllocator.subscribeLivePages(listener),
    }
  );
  digestProcess.viewStoreByRendererId.set(
    appViewInstance.webContents.id,
    viewStore
  );
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
    await openWindow(
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
  configureDownloads(downloadManager, () => globalAppView);
  await digestProcess.bindElectron(downloadManager, openWindow);

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

    const saved = await services.assetService.importUrl({
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

  // Update view bounds when window is resized
  baseWindow.on("resize", updateViewBounds);

  baseWindow.on("closed", () => {
    const rendererId = appViewInstance.webContents.id;
    viewStore.dispose();
    digestProcess.viewStoreByRendererId.delete(rendererId);
    initialized.collaborationDocuments.unsubscribe(rendererId);
    digestProcess.placementIdByRendererId.delete(rendererId);
    digestProcess.placementRegistry.retireWindow(windowId);
    digestProcess.windowRegistry.retire(windowId);
    if (globalAppView === appViewInstance) {
      globalAppView =
        digestProcess.windowRegistry.list()[0]?.rendererView ?? null;
    }
  });
};

export const openWindowFrom = async (
  sourceWindow: BrowserWindow | null
): Promise<void> => {
  const initialized = await digestProcess.initialize();
  const sourceSession = sourceWindow
    ? digestProcess.windowRegistry.resolveWindow(sourceWindow)
    : undefined;
  const documentId =
    sourceSession?.selectedDocumentId ??
    initialized.services.documentManager.activeDocument?.id ??
    null;

  await openWindow(
    documentId ? `#/doc/${encodeURIComponent(documentId)}` : undefined,
    documentId
  );
};

export const dispose = () => digestProcess.dispose();

export const runOAuthE2E = async (): Promise<void> => {
  const renderer = globalAppView?.webContents;
  if (!renderer || renderer.isDestroyed()) throw new Error("Digest renderer is unavailable");
  await renderer.executeJavaScript(`
    (async () => {
      const find = (label, selector) => new Promise((resolve, reject) => {
        const deadline = Date.now() + 15000;
        const poll = () => {
          const element = [...document.querySelectorAll(selector)].find((candidate) =>
            (candidate.getAttribute("aria-label") || candidate.textContent || "").trim() === label
          );
          if (element) { resolve(element); return; }
          if (Date.now() >= deadline) { reject(new Error("Could not find " + label)); return; }
          setTimeout(poll, 50);
        };
        poll();
      });
      const click = async (label, selector) => (await find(label, selector)).click();
      await click("Default settings", "button[aria-label$=' settings']");
      await click("Settings", "[role='menuitem']");
      await click("Enable Google Calendar", "button");
      await find("digest-e2e@example.test", "*");
    })()
  `, true);
};
