import { BrowserWindow, WebContents, WebContentsView } from "electron";
import {
  ViewEntry,
  ViewWorld,
  emptyWorld,
} from "../domains/browser-views/core/types";
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
import { BrowsingJourneyStore } from "./BrowsingJourneyStore";
import {
  CacheAttempt,
  LivePageCacheTelemetry,
} from "./LivePageCacheTelemetry";
import {
  CacheMissReason,
  decideOpenReferenceExecution,
  shouldRetainJourney,
} from "./LivePageOpenPolicy";
import { LivePagesProjection } from "../types/browser";
import { LivePageProjectionStore } from "./LivePageProjectionStore";
import { PlacementGenerationStore } from "./PlacementGenerationStore";
import type {
  OpenReferenceRequest,
  OpenReferenceResult,
  ViewContextMenus,
  ViewEffects,
  ViewEvents,
  ViewHandleOperations,
  ViewNotifications,
  ViewStoreDependencies,
} from "./ViewStoreContracts";

/**
 * The ViewStore orchestrates the pure core with Electron adapters.
 *
 * This replaces ViewManager as the main entry point.
 */
export class ViewStore {
  private world: ViewWorld = emptyWorld;
  private handles: HandleRegistry;
  private interpreter: ViewEffects;
  private notifications: ViewNotifications;
  private events: ViewEvents;
  private contextMenus: ViewContextMenus;
  private operations: ViewHandleOperations;
  private eventDisposers = new Map<string, () => void>();

  private downloadManager?: DownloadManager;
  private journeys: BrowsingJourneyStore;
  private livePages: LivePageProjectionStore;
  private readonly now: () => number;
  private placementGenerations = new PlacementGenerationStore();

  // Rate limiting: track pending creates to prevent duplicate URL loads
  // Maps viewId -> { url, timestamp } of pending create commands
  private pendingCreates = new Map<string, { url: string; timestamp: number }>();
  private static readonly CREATE_COOLDOWN_MS = 5000; // 5 second cooldown per URL

  constructor(
    baseWindow: BrowserWindow,
    layerManager: ViewLayerManager | undefined,
    rendererWebContents: WebContents,
    private readonly cacheTelemetry?: LivePageCacheTelemetry,
    dependencies: ViewStoreDependencies = {}
  ) {
    this.now = dependencies.now ?? Date.now;
    this.journeys = dependencies.journeys ?? new BrowsingJourneyStore(10);
    this.livePages = dependencies.livePages ?? new LivePageProjectionStore();
    this.handles = dependencies.handles ?? new HandleRegistry();
    this.notifications =
      dependencies.notifications ??
      new NotificationLayer(rendererWebContents, (handleId) =>
        this.journeys.getActivePlacementId(handleId)
      );
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

      if (cmd.type === "rendererGone") {
        const placementId = this.journeys.getActivePlacementId(cmd.id);
        this.journeys.remove(cmd.id);
        this.placementGenerations.remove(placementId);
        this.pendingCreates.delete(placementId);
        this.pendingCreates.delete(cmd.id);
      }

      if (cmd.type === "updateNavigation") {
        const position = this.operations.getNavigationPosition(cmd.id);
        this.journeys.recordNavigation(
          cmd.id,
          cmd.url,
          position.success ? position.value.activeIndex : undefined
        );
        this.publishLiveReferences();
      }

      const cmdId = "id" in cmd ? cmd.id : undefined;
      log.debug(
        `[${cmdId ?? "unknown"}] Command dispatched: ${cmd.type}`,
        "ViewStore"
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

  // Public API methods that dispatch commands

  /** Compatibility adapter for the existing renderer update channel. */
  handleBlockViewUpdate(update: OpenReferenceRequest): void {
    this.openReference(update);
  }

  /** Authoritative main-process operation for opening any URL reference. */
  openReference(update: OpenReferenceRequest): OpenReferenceResult | undefined {
    if (
      !this.placementGenerations.acceptUpdate(
        update.viewId,
        update.placementGeneration
      )
    ) {
      log.debug(
        `[${update.viewId}] Ignoring stale placement update generation ${update.placementGeneration}`,
        "ViewStore"
      );
      return undefined;
    }
    const handleId = this.resolveHandleId(update.viewId);
    const existing = this.world.get(handleId);
    const diagnostics = this.journeys.getDiagnostics(
      update.profileId,
      update.url
    );

    if (existing) {
      return this.updateExistingReference(
        update,
        handleId,
        existing,
        diagnostics
      );
    }

    const corePlan = this.journeys.planOpenReference({
      placementId: update.viewId,
      referenceId: update.blockId,
      profileId: update.profileId,
      url: update.url,
    });
    const reusableView =
      corePlan.type === "reuse-current" || corePlan.type === "reuse-history"
        ? this.handles.get(corePlan.handleId)
        : undefined;
    const execution = decideOpenReferenceExecution(
      corePlan,
      diagnostics,
      Boolean(reusableView && !reusableView.webContents.isDestroyed())
    );

    if (execution.type === "reuse-current") {
      const targetIndex =
        execution.plan.type === "reuse-history"
          ? execution.plan.historyIndex
          : undefined;
      const prepared = this.operations.prepareNavigationEntry(
        execution.plan.handleId,
        execution.plan.requestedUrl,
        targetIndex
      );
      if (!prepared.success) {
        this.journeys.forgetHistoryAssociation(
          execution.plan.handleId,
          execution.plan.requestedUrl
        );
        return this.createReference(update, diagnostics, "stale_association");
      }
      const attached = this.interpreter.attachView(execution.plan.handleId);
      if (attached) {
        this.journeys.activatePlacement(execution.plan);
        this.updatePlacementBounds(execution.plan.handleId, update);
        this.notifyPlacementReady(update);
        this.publishLiveReferences();
        return this.finishCacheAttempt(update, diagnostics, {
          journeyId: execution.plan.journeyId,
          outcome:
            execution.plan.type === "reuse-history"
              ? "hit_history"
              : "hit_current",
          loadAvoided: true,
        });
      }
      this.discardJourney(execution.plan.handleId);
      this.pendingCreates.delete(update.viewId);
      return this.createReference(update, diagnostics, "attach_failed");
    }

    if (execution.staleHandleId) {
      this.discardJourney(execution.staleHandleId);
    }
    return this.createReference(update, diagnostics, execution.missReason);
  }

  private updateExistingReference(
    update: OpenReferenceRequest,
    handleId: string,
    existing: ViewEntry,
    diagnostics: ReturnType<BrowsingJourneyStore["getDiagnostics"]>
  ): OpenReferenceResult | undefined {
    if (!this.journeys.isDetached(handleId)) {
      this.updatePlacementBounds(handleId, update, existing);
      return undefined;
    }

    const historyMatch = this.journeys.resolveHistory(
      update.profileId,
      update.url
    );
    const targetIndex =
      historyMatch?.handleId === handleId
        ? historyMatch.historyIndex
        : undefined;
    const prepared = this.operations.prepareNavigationEntry(
      handleId,
      update.url,
      targetIndex
    );
    if (!prepared.success) {
      this.discardJourney(handleId);
      this.pendingCreates.delete(update.viewId);
      return this.createReference(update, diagnostics, "stale_association");
    }

    if (!this.interpreter.attachView(handleId)) {
      this.discardJourney(handleId);
      this.pendingCreates.delete(update.viewId);
      return this.createReference(update, diagnostics, "attach_failed");
    }

    // Commit only after the Electron attachment succeeds.
    this.journeys.markVisible(handleId, update.viewId);
    this.updatePlacementBounds(handleId, update, existing);
    this.notifyPlacementReady(update);
    this.publishLiveReferences();
    return this.finishCacheAttempt(update, diagnostics, {
      journeyId: this.journeys.getJourneyId(handleId),
      outcome: targetIndex === undefined ? "hit_current" : "hit_history",
      loadAvoided: true,
    });
  }

  private createReference(
    update: OpenReferenceRequest,
    diagnostics: ReturnType<BrowsingJourneyStore["getDiagnostics"]>,
    missReason: CacheMissReason
  ): OpenReferenceResult | undefined {
    const pending = this.pendingCreates.get(update.viewId);
    const now = this.now();
    if (
      pending?.url === update.url &&
      now - pending.timestamp < ViewStore.CREATE_COOLDOWN_MS
    ) {
      return undefined;
    }
    this.pendingCreates.set(update.viewId, { url: update.url, timestamp: now });
    this.dispatch({
      type: "create",
      id: update.viewId,
      url: update.url,
      bounds: update.bounds,
      profile: update.profileId,
      layout: update.layout ?? "inline",
    });

    const createdView = this.handles.get(update.viewId);
    const rendererAvailable = Boolean(
      createdView && !createdView.webContents.isDestroyed()
    );
    if (shouldRetainJourney(update.layout) && rendererAvailable) {
      this.destroyEvictedViews(
        this.journeys.addVisible(
          update.viewId,
          update.profileId,
          update.url,
          update.blockId
        )
      );
      this.publishLiveReferences();
    }
    return this.finishCacheAttempt(update, diagnostics, {
      journeyId: this.journeys.getJourneyId(update.viewId),
      outcome: "miss",
      missReason: rendererAvailable ? missReason : "renderer_unavailable",
      loadAvoided: false,
    });
  }

  private notifyPlacementReady(update: OpenReferenceRequest): void {
    const mapping = this.journeys.getActiveMapping(update.viewId);
    if (!mapping) {
      log.error(
        `[${update.viewId}] Refusing ready notification without an active identity mapping: ${JSON.stringify({
          routeId: update.routeId ?? update.blockId,
          placementId: update.viewId,
          transitionGeneration:
            update.transitionGeneration ?? update.placementGeneration ?? 0,
        })}`,
        "ViewStore"
      );
      return;
    }
    const identity = {
      routeId: update.routeId ?? update.blockId,
      ...mapping,
      transitionGeneration:
        update.transitionGeneration ?? update.placementGeneration ?? 0,
    };
    log.debug(
      `[${update.viewId}] Presentation ready: ${JSON.stringify(identity)}`,
      "ViewStore"
    );
    this.notifications.notifyPlacementReady(identity);
  }

  private updatePlacementBounds(
    handleId: string,
    update: OpenReferenceRequest,
    existing = this.world.get(handleId)
  ): void {
    if (!existing) return;
    const boundsChanged =
      existing.bounds.x !== update.bounds.x ||
      existing.bounds.y !== update.bounds.y ||
      existing.bounds.width !== update.bounds.width ||
      existing.bounds.height !== update.bounds.height;
    const layoutChanged =
      update.layout !== undefined && existing.layout !== update.layout;
    if (boundsChanged || layoutChanged) {
      this.dispatch({
        type: "updateBounds",
        id: handleId,
        bounds: update.bounds,
        layout: update.layout,
      });
    }
  }

  private discardJourney(handleId: string): void {
    this.journeys.remove(handleId);
    this.dispatch({ type: "remove", id: handleId });
    this.publishLiveReferences();
  }

  private finishCacheAttempt(
    update: OpenReferenceRequest,
    diagnostics: ReturnType<BrowsingJourneyStore["getDiagnostics"]>,
    result: OpenReferenceResult
  ): OpenReferenceResult {
    this.recordCacheAttempt(update, diagnostics, result);
    return result;
  }

  private recordCacheAttempt(
    update: OpenReferenceRequest,
    diagnostics: ReturnType<BrowsingJourneyStore["getDiagnostics"]>,
    result: OpenReferenceResult
  ): void {
    if (!this.cacheTelemetry || update.layout !== "full") return;
    const finalDiagnostics = this.journeys.getDiagnostics(
      update.profileId,
      update.url
    );
    const attempt: CacheAttempt = {
      profileId: update.profileId,
      referenceKind: update.referenceKind ?? "site-block",
      requestedUrl: update.url,
      outcome: result.outcome,
      missReason: result.missReason,
      candidateCount: diagnostics.candidateCount,
      cacheSize: finalDiagnostics.cacheSize,
      detachedCount: finalDiagnostics.detachedCount,
      reusedJourney:
        result.outcome === "hit_current" || result.outcome === "hit_history",
      loadAvoided: result.loadAvoided,
    };
    try {
      this.cacheTelemetry.record(attempt);
    } catch (error) {
      log.warn(`Failed to record live page cache attempt: ${error}`, "ViewStore");
    }
  }

  handleRemoveView(viewId: string): void {
    const handleId = this.resolveHandleId(viewId);
    log.debug(`[${viewId}] Removing view`, "ViewStore");
    // Clean up rate limiting state
    this.pendingCreates.delete(viewId);
    this.placementGenerations.remove(viewId);
    this.eventDisposers.get(handleId)?.();
    this.eventDisposers.delete(handleId);
    const wasLive = this.journeys.remove(handleId);
    this.dispatch({ type: "remove", id: handleId });
    if (wasLive) {
      this.publishLiveReferences();
    }
  }

  /** Detach a notebook page while retaining its live WebContents. */
  handleDetachView(viewId: string, placementGeneration?: number): void {
    if (
      !this.placementGenerations.acceptDetach(viewId, placementGeneration)
    ) {
      log.debug(
        `[${viewId}] Ignoring stale detach generation ${placementGeneration}`,
        "ViewStore"
      );
      return;
    }
    const handleId = this.resolveHandleId(viewId);
    if (!this.journeys.has(handleId)) {
      this.handleRemoveView(viewId);
      return;
    }

    log.debug(`[${viewId}] Detaching live page`, "ViewStore");
    this.interpreter.detachView(handleId);
    this.destroyEvictedViews(this.journeys.markDetached(handleId));
    this.publishLiveReferences();
    log.debug(
      `[${viewId}] Detach committed: ${JSON.stringify({
        handleId,
        placementGeneration,
        journeyDetached: this.journeys.isDetached(handleId),
        worldHasPlacement: this.getWorld().has(viewId),
        handleRetained: this.getHandleRegistry().has(handleId),
      })}`,
      "ViewStore"
    );
  }

  getLiveReferences(): Array<{ profileId: string; url: string }> {
    return this.journeys.getLiveReferences();
  }

  getLivePagesProjection(): LivePagesProjection {
    return this.livePages.getSnapshot();
  }

  private publishLiveReferences(): void {
    const projection = this.livePages.sync(this.getLiveReferences());
    if (projection) {
      this.notifications.notifyLiveReferencesChanged(projection);
    }
  }

  private destroyEvictedViews(viewIds: string[]): void {
    for (const viewId of viewIds) {
      log.debug(`[${viewId}] Evicting live page`, "ViewStore");
      this.pendingCreates.delete(viewId);
      this.dispatch({ type: "remove", id: viewId });
    }
  }

  retryView(blockId: string): void {
    log.debug(`[${blockId}] Retrying view`, "ViewStore");
    this.dispatch({ type: "retry", id: this.resolveHandleId(blockId) });
  }

  reloadView(viewId: string): void {
    log.debug(`[${viewId}] Reloading view`, "ViewStore");
    this.dispatch({ type: "reload", id: this.resolveHandleId(viewId) });
  }

  resolveHandleId(viewId: string): string {
    return this.journeys.resolveHandleId(viewId);
  }

  getJourneyIdForHandle(handleId: string): string | undefined {
    return this.journeys.getJourneyId(handleId);
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
    const result = this.operations.getDevToolsState(
      this.resolveHandleId(blockId)
    );
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
    const result = this.operations.toggleDevTools(this.resolveHandleId(blockId));
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
    const result = this.operations.goBack(this.resolveHandleId(blockId));
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
