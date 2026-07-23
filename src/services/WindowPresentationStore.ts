import { BrowserWindow, WebContents, WebContentsView } from "electron";
import { randomUUID } from "node:crypto";
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
import type { LivePageCacheTelemetry } from "./LivePageCacheTelemetry";
import type { BrowserPresentationIdentity } from "../types/browser";
import { PlacementGenerationStore } from "./PlacementGenerationStore";
import type {
  DetachPlacementCommand,
  OpenReferenceCommand,
  ViewContextMenus,
  ViewEffects,
  ViewEvents,
  ViewHandleOperations,
  ViewNotifications,
  WindowPresentationStoreDependencies,
} from "./BrowserPresentationContracts";

/**
 * Per-window owner of native attachment, layout, generations, and renderer
 * notifications. Application-scoped journey selection lives in
 * BrowserPresentationCoordinator.
 */
export class WindowPresentationStore {
  private world: ViewWorld = emptyWorld;
  private readonly handles: HandleRegistry;
  private readonly resolveHandleIdForPlacement: (
    placementId: string
  ) => string | undefined;
  private readonly onRendererGone: (handleId: string) => string | undefined;
  private readonly onNavigation: (
    handleId: string,
    url: string,
    historyIndex?: number
  ) => void;
  private readonly publishLivePages: () => void;
  private readonly disposeLivePageSubscription: () => void;
  private interpreter: ViewEffects;
  private notifications: ViewNotifications;
  private events: ViewEvents;
  private contextMenus: ViewContextMenus;
  private operations: ViewHandleOperations;
  private eventDisposers = new Map<string, () => void>();

  private downloadManager?: DownloadManager;
  private readonly createHandleId: (placementId: string) => string;
  private placementGenerations = new PlacementGenerationStore();

  constructor(
    baseWindow: BrowserWindow,
    layerManager: ViewLayerManager | undefined,
    rendererWebContents: WebContents,
    _cacheTelemetry?: LivePageCacheTelemetry,
    dependencies: WindowPresentationStoreDependencies = {}
  ) {
    this.createHandleId =
      dependencies.createHandleId ?? (() => `handle-${randomUUID()}`);
    this.handles = dependencies.handles ?? new HandleRegistry();
    this.resolveHandleIdForPlacement =
      dependencies.resolveHandleIdForPlacement ?? (() => undefined);
    this.onRendererGone = dependencies.onRendererGone ?? (() => undefined);
    this.onNavigation = dependencies.onNavigation ?? (() => undefined);
    this.publishLivePages = dependencies.publishLivePages ?? (() => undefined);
    this.notifications =
      dependencies.notifications ??
      new NotificationLayer(
        rendererWebContents,
        dependencies.resolvePresentationIdentity ?? (() => undefined)
      );
    this.disposeLivePageSubscription =
      dependencies.subscribeLivePages?.((projection) =>
        this.notifications.notifyLiveReferencesChanged(projection)
      ) ?? (() => undefined);
    this.contextMenus =
      dependencies.contextMenus ?? new ContextMenuController();
    this.events =
      dependencies.events ??
      new EventTranslator(this.contextMenus);
    this.operations =
      dependencies.operations ?? new HandleOperations(this.handles);
    const onViewCreated = (
      id: string,
      view: WebContentsView,
      profileId: string
    ) => {
        // When a view is created, attach event listeners
        this.eventDisposers.get(id)?.();
        this.eventDisposers.set(
          id,
          this.events.attach(id, view, (cmd) => this.dispatch(cmd), profileId)
        );
        // Attach download handling to the view's session
        if (this.downloadManager) {
          this.downloadManager.attachToWebContents(view.webContents);
        }
      };
    this.interpreter = dependencies.createEffects
      ? dependencies.createEffects(onViewCreated)
      : new Interpreter(
          baseWindow,
          layerManager,
          this.handles,
          onViewCreated
        );

    log.debug(
      "WindowPresentationStore initialized",
      "WindowPresentationStore"
    );
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

      if (cmd.type === "rendererGone") {
        const placementId = this.onRendererGone(cmd.id);
        if (placementId) this.placementGenerations.remove(placementId);
      }

      if (cmd.type === "updateNavigation") {
        const position = this.operations.getNavigationPosition(cmd.id);
        this.onNavigation(
          cmd.id,
          cmd.url,
          position.success ? position.value.activeIndex : undefined
        );
        this.publishLiveReferences();
      }

      const cmdId = "id" in cmd ? cmd.id : undefined;
      log.debug(
        `[${cmdId ?? "unknown"}] Command dispatched: ${cmd.type}`,
        "WindowPresentationStore"
      );

      // Execute side effects
      if (cmd.type === "remove" || cmd.type === "rendererGone") {
        this.eventDisposers.get(cmd.id)?.();
        this.eventDisposers.delete(cmd.id);
      }
      this.interpreter.interpret(cmd);

      // Notify renderer of changes
      if (cmdId) {
        this.notifications.notify(cmdId, prevWorld, nextWorld);
      }
      if (cmd.type === "rendererGone") {
        this.publishLiveReferences();
      }
    }
  }

  /**
   * Get current world state (for debugging/testing)
   */
  getWorld(): ViewWorld {
    return this.world;
  }

  acceptPlacementUpdate(update: OpenReferenceCommand): boolean {
    return this.placementGenerations.acceptUpdate(
      update.placementId,
      update.placementGeneration,
      update.transitionGeneration
    );
  }

  acceptPlacementDetach(command: DetachPlacementCommand): boolean {
    return this.placementGenerations.acceptDetach(
      command.placementId,
      command.placementGeneration,
      command.transitionGeneration
    );
  }

  retirePlacement(placementId: string): void {
    this.placementGenerations.remove(placementId);
  }

  detachHandle(handleId: string): void {
    this.interpreter.detachView(handleId);
  }

  attachHandle(handleId: string): boolean {
    return this.interpreter.attachView(handleId);
  }

  prepareNavigationEntry(
    handleId: string,
    requestedUrl: string,
    historyIndex?: number
  ): boolean {
    return this.operations.prepareNavigationEntry(
      handleId,
      requestedUrl,
      historyIndex
    ).success;
  }

  adoptHandle(handleId: string, update: OpenReferenceCommand): void {
    if (this.world.has(handleId)) return;
    const adopted = new Map(this.world);
    adopted.set(handleId, {
      url: update.url,
      history: { canGoBack: false },
      bounds: update.bounds,
      profile: update.profileId,
      layout: update.layout,
      loadState: { type: "ready" },
    });
    this.world = adopted;
    const view = this.handles.get(handleId);
    if (!view) return;
    this.eventDisposers.get(handleId)?.();
    this.eventDisposers.set(
      handleId,
      this.events.attach(
        handleId,
        view,
        (command) => this.dispatch(command),
        update.profileId
      )
    );
  }

  createHandle(update: OpenReferenceCommand): string {
    const handleId =
      update.layout === "full"
        ? this.createHandleId(update.placementId)
        : update.placementId;
    this.dispatch({
      type: "create",
      id: handleId,
      url: update.url,
      bounds: update.bounds,
      profile: update.profileId,
      layout: update.layout,
    });
    return handleId;
  }

  removeHandle(handleId: string): void {
    this.eventDisposers.get(handleId)?.();
    this.eventDisposers.delete(handleId);
    this.dispatch({ type: "remove", id: handleId });
  }

  /** Relinquish local presentation state without destroying a shared handle. */
  forgetHandle(handleId: string): void {
    this.eventDisposers.get(handleId)?.();
    this.eventDisposers.delete(handleId);
    if (!this.world.has(handleId)) return;
    const next = new Map(this.world);
    next.delete(handleId);
    this.world = next;
  }

  notifyPlacementReady(identity: BrowserPresentationIdentity): void {
    this.notifications.notifyPlacementReady(identity);
  }

  updatePlacementBounds(
    handleId: string,
    update: OpenReferenceCommand,
    existing = this.world.get(handleId)
  ): void {
    if (!existing) return;
    const boundsChanged =
      existing.bounds.x !== update.bounds.x ||
      existing.bounds.y !== update.bounds.y ||
      existing.bounds.width !== update.bounds.width ||
      existing.bounds.height !== update.bounds.height;
    const layoutChanged = existing.layout !== update.layout;
    if (boundsChanged || layoutChanged) {
      this.dispatch({
        type: "updateBounds",
        id: handleId,
        bounds: update.bounds,
        layout: update.layout,
      });
    }
  }

  publishLiveReferences(): void {
    this.publishLivePages();
  }

  dispose(): void {
    this.disposeLivePageSubscription();
    for (const dispose of this.eventDisposers.values()) dispose();
    this.eventDisposers.clear();
  }

  retryView(blockId: string): void {
    log.debug(`[${blockId}] Retrying view`, "WindowPresentationStore");
    const handleId = this.getHandleIdForPlacement(blockId);
    if (handleId) this.dispatch({ type: "retry", id: handleId });
  }

  reloadView(viewId: string): void {
    log.debug(`[${viewId}] Reloading view`, "WindowPresentationStore");
    const handleId = this.getHandleIdForPlacement(viewId);
    if (handleId) this.dispatch({ type: "reload", id: handleId });
  }

  getHandleIdForPlacement(placementId: string): string | undefined {
    return (
      this.resolveHandleIdForPlacement(placementId) ??
      (this.handles.has(placementId) ? placementId : undefined)
    );
  }

  /**
   * Get the HandleRegistry (for compatibility with existing code that needs WebContentsView access)
   */
  getHandleRegistry(): HandleRegistry {
    return this.handles;
  }

  notifyBrowserSelection(selection: {
    blockId: string;
    sourceUrl: string;
    sourceTitle: string;
    selectionText: string;
    selectionHtml: string;
    capturedAt: number;
  }): void {
    this.notifications.notifyBrowserSelection(selection);
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
    const handleId = this.getHandleIdForPlacement(blockId);
    if (!handleId) {
      return { success: false, isOpen: false, error: "No active view found" };
    }
    const result = this.operations.getDevToolsState(handleId);
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
    const handleId = this.getHandleIdForPlacement(blockId);
    if (!handleId) {
      return { success: false, isOpen: false, error: "No active view found" };
    }
    const result = this.operations.toggleDevTools(handleId);
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
    const handleId = this.getHandleIdForPlacement(blockId);
    if (!handleId) {
      return { success: false, canGoBack: false, error: "No active view found" };
    }
    const result = this.operations.goBack(handleId);
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

}
