import { BrowserWindow, WebContents } from "electron";
import { ViewWorld, emptyWorld } from "../domains/browser-views/core/types";
import { Command } from "../domains/browser-views/core/commands";
import { reduce } from "../domains/browser-views/core/reducer";
import { Interpreter } from "../domains/browser-views/adapter/Interpreter";
import { NotificationLayer } from "../domains/browser-views/adapter/NotificationLayer";
import { HandleRegistry } from "../domains/browser-views/adapter/HandleRegistry";
import { EventTranslator } from "../domains/browser-views/adapter/EventTranslator";
import { ContextMenuController } from "../domains/browser-views/adapter/ContextMenuController";
import { HandleOperations } from "../domains/browser-views/adapter/HandleOperations";
import { ViewLayerManager } from "./ViewLayerManager";
import { log } from "../utils/mainLogger";
import { DownloadManager } from "./DownloadManager";
import { LivePageCache } from "./LivePageCache";
import { toBlockId } from "../utils/viewId";

/**
 * The ViewStore orchestrates the pure core with Electron adapters.
 *
 * This replaces ViewManager as the main entry point.
 */
export class ViewStore {
  private world: ViewWorld = emptyWorld;
  private handles = new HandleRegistry();
  private interpreter: Interpreter;
  private notifications: NotificationLayer;
  private events: EventTranslator;
  private contextMenus: ContextMenuController;
  private operations: HandleOperations;

  private downloadManager?: DownloadManager;
  private livePages = new LivePageCache(10);

  // Rate limiting: track pending creates to prevent duplicate URL loads
  // Maps viewId -> { url, timestamp } of pending create commands
  private pendingCreates = new Map<string, { url: string; timestamp: number }>();
  private static readonly CREATE_COOLDOWN_MS = 5000; // 5 second cooldown per URL

  constructor(
    baseWindow: BrowserWindow,
    layerManager: ViewLayerManager | undefined,
    rendererWebContents: WebContents
  ) {
    this.notifications = new NotificationLayer(rendererWebContents);
    this.contextMenus = new ContextMenuController();
    this.events = new EventTranslator(this.contextMenus);
    this.operations = new HandleOperations(this.handles);
    this.interpreter = new Interpreter(
      baseWindow,
      layerManager,
      this.handles,
      rendererWebContents,
      (id, view, profileId) => {
        // When a view is created, attach event listeners
        this.events.attach(id, view, (cmd) => this.dispatch(cmd), profileId);
        // Attach download handling to the view's session
        if (this.downloadManager) {
          this.downloadManager.attachToWebContents(view.webContents);
        }
      }
    );

    log.debug("ViewStore initialized", "ViewStore");
  }

  /**
   * Dispatch a command to update the world.
   * This is the only way to change state.
   */
  dispatch(cmd: Command): void {
    const prevWorld = this.world;
    const nextWorld = reduce(this.world, cmd);

    // Only do work if state actually changed
    if (prevWorld !== nextWorld) {
      this.world = nextWorld;

      const cmdId = "id" in cmd ? cmd.id : undefined;
      log.debug(
        `[${cmdId ?? "unknown"}] Command dispatched: ${cmd.type}`,
        "ViewStore"
      );

      // Execute side effects
      this.interpreter.interpret(cmd);

      // Notify renderer of changes
      if (cmdId) {
        this.notifications.notify(cmdId, prevWorld, nextWorld);
      }
    }
  }

  /**
   * Get current world state (for debugging/testing)
   */
  getWorld(): ViewWorld {
    return this.world;
  }

  // Public API methods that dispatch commands

  handleBlockViewUpdate(update: {
    viewId: string;
    blockId: string;
    url: string;
    bounds: { x: number; y: number; width: number; height: number };
    profileId: string;
    layout?: "inline" | "full";
  }): void {
    const existing = this.world.get(update.viewId);

    if (!existing) {
      // Rate limiting: check if we recently requested to create this view with this URL
      const pending = this.pendingCreates.get(update.viewId);
      const now = Date.now();

      if (pending) {
        const elapsed = now - pending.timestamp;
        if (pending.url === update.url && elapsed < ViewStore.CREATE_COOLDOWN_MS) {
          log.debug(
            `[${update.viewId}] Skipping duplicate create for ${update.url} (${elapsed}ms since last request)`,
            "ViewStore"
          );
          return;
        }
      }

      // Track this create request
      this.pendingCreates.set(update.viewId, { url: update.url, timestamp: now });

      log.debug(
        `[${update.viewId}] Creating new view for ${update.url}`,
        "ViewStore"
      );
      this.dispatch({
        type: "create",
        id: update.viewId,
        url: update.url,
        bounds: update.bounds,
        profile: update.profileId,
        layout: update.layout ?? "inline",
      });

      if (this.isCacheable(update.viewId, update.blockId, update.layout)) {
        this.destroyEvictedViews(
          this.livePages.addVisible(update.viewId, update.blockId)
        );
        this.notifyLivePagesChanged();
      }
    } else {
      if (this.livePages.isCached(update.viewId)) {
        this.interpreter.attachView(update.viewId);
        this.livePages.markVisible(update.viewId);
        this.notifyLivePagesChanged();
      }

      // Check if we need to update bounds or layout
      const boundsChanged =
        existing.bounds.x !== update.bounds.x ||
        existing.bounds.y !== update.bounds.y ||
        existing.bounds.width !== update.bounds.width ||
        existing.bounds.height !== update.bounds.height;
      const layoutChanged =
        update.layout !== undefined && existing.layout !== update.layout;

      if (boundsChanged || layoutChanged) {
        log.debug(
          `[${update.viewId}] Updating bounds${layoutChanged ? " and layout" : ""}`,
          "ViewStore"
        );
        this.dispatch({
          type: "updateBounds",
          id: update.viewId,
          bounds: update.bounds,
          layout: update.layout,
        });
      }
    }
  }

  handleRemoveView(viewId: string): void {
    log.debug(`[${viewId}] Removing view`, "ViewStore");
    // Clean up rate limiting state
    this.pendingCreates.delete(viewId);
    const wasLive = this.livePages.remove(viewId);
    this.dispatch({ type: "remove", id: viewId });
    if (wasLive) this.notifyLivePagesChanged();
  }

  /** Detach a notebook page while retaining its live WebContents. */
  handleDetachView(viewId: string): void {
    if (!this.livePages.has(viewId)) {
      this.handleRemoveView(viewId);
      return;
    }

    log.debug(`[${viewId}] Detaching live page`, "ViewStore");
    this.interpreter.detachView(viewId);
    this.destroyEvictedViews(this.livePages.markCached(viewId));
    this.notifyLivePagesChanged();
  }

  getLivePageBlockIds(): string[] {
    return this.livePages.getLiveBlockIds();
  }

  private isCacheable(
    viewId: string,
    blockId: string,
    layout?: "inline" | "full"
  ): boolean {
    return (
      layout === "full" &&
      !blockId.startsWith("ephemeral-") &&
      toBlockId(viewId) === blockId
    );
  }

  private destroyEvictedViews(viewIds: string[]): void {
    for (const viewId of viewIds) {
      log.debug(`[${viewId}] Evicting live page`, "ViewStore");
      this.pendingCreates.delete(viewId);
      this.dispatch({ type: "remove", id: viewId });
    }
  }

  private notifyLivePagesChanged(): void {
    const renderer = this.interpreter.getRendererWebContents();
    if (!renderer.isDestroyed()) {
      renderer.send("browser:live-pages-changed", {
        blockIds: this.getLivePageBlockIds(),
      });
    }
  }

  retryView(blockId: string): void {
    log.debug(`[${blockId}] Retrying view`, "ViewStore");
    this.dispatch({ type: "retry", id: blockId });
  }

  reloadView(viewId: string): void {
    log.debug(`[${viewId}] Reloading view`, "ViewStore");
    this.dispatch({ type: "reload", id: viewId });
  }

  /**
   * Get the HandleRegistry (for compatibility with existing code that needs WebContentsView access)
   */
  getHandleRegistry(): HandleRegistry {
    return this.handles;
  }

  /**
   * Get the renderer WebContents (for sending events to renderer)
   */
  getRendererWebContents(): WebContents {
    return this.interpreter.getRendererWebContents();
  }

  // Handle operations (direct queries/effects on views, no state change)

  /**
   * Get DevTools state for a view.
   * This is a query on the Electron handle, not a state change.
   */
  getDevToolsState(blockId: string): {
    success: boolean;
    isOpen: boolean;
    error?: string;
  } {
    const result = this.operations.getDevToolsState(blockId);
    if (result.success === false) {
      return { success: false, isOpen: false, error: result.error };
    }
    return { success: true, isOpen: result.value.isOpen };
  }

  /**
   * Toggle DevTools for a view.
   * This is a side effect on the Electron handle, not a state change.
   */
  toggleDevTools(blockId: string): {
    success: boolean;
    isOpen: boolean;
    error?: string;
  } {
    const result = this.operations.toggleDevTools(blockId);
    if (result.success === false) {
      return { success: false, isOpen: false, error: result.error };
    }
    return { success: true, isOpen: result.value.isOpen };
  }

  /**
   * Navigate back in history.
   * This triggers a side effect; the URL change will come back as an event.
   */
  goBack(blockId: string): {
    success: boolean;
    canGoBack: boolean;
    error?: string;
  } {
    const result = this.operations.goBack(blockId);
    if (result.success === false) {
      return { success: false, canGoBack: false, error: result.error };
    }
    return { success: true, canGoBack: result.value.canGoBack };
  }

  /**
   * Set the download manager so it can attach to new browser block sessions.
   */
  setDownloadManager(dm: DownloadManager): void {
    this.downloadManager = dm;
  }

  /**
   * Set callback for background link clicks (cmd+click) that should insert inline links.
   * This is external coordination with main.ts, not a state change.
   */
  setBackgroundLinkClickCallback(
    callback: (
      url: string,
      sourceBlockId: string,
      title: string,
      profileId: string
    ) => void
  ): void {
    this.events.setBackgroundLinkClickCallback(callback);
  }

  /**
   * Set callback for right-click image clipping in browser views.
   */
  setImageContextCallback(
    callback: Parameters<ContextMenuController["setImageContextCallback"]>[0]
  ): void {
    this.contextMenus.setImageContextCallback(callback);
  }

  /**
   * Set a pending scroll position to restore when the view finishes loading.
   * Called from renderer when a block mounts with an existing scrollPercent.
   */
  setScrollPercent(blockId: string, scrollPercent: number): void {
    log.debug(
      `[${blockId}] Setting scroll percent: ${scrollPercent}`,
      "ViewStore"
    );
    this.interpreter.setPendingScrollRestore(blockId, scrollPercent);
  }
}
