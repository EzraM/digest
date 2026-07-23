import type { ViewEntry } from "../domains/browser-views/core/types";
import { log } from "../utils/mainLogger";
import type {
  DetachPlacementCommand,
  OpenReferenceCommand,
  OpenReferenceResult,
} from "./BrowserPresentationContracts";
import { ApplicationJourneyAllocator } from "./ApplicationJourneyAllocator";
import type { CacheAttempt, LivePageCacheTelemetry } from "./LivePageCacheTelemetry";
import {
  type CacheMissReason,
  decideOpenReferenceExecution,
  shouldRetainJourney,
} from "./LivePageOpenPolicy";
import type { WindowPresentationStore } from "./WindowPresentationStore";

/**
 * Application-scoped orchestration for presenting shared browsing journeys.
 *
 * The coordinator is the only component that selects or reserves journeys.
 * Window stores receive concrete handles and perform only window-local native
 * effects.
 */
export class BrowserPresentationCoordinator {
  private readonly pendingCreates = new Map<
    string,
    { url: string; timestamp: number }
  >();
  private readonly storeByHandleId = new Map<string, WindowPresentationStore>();
  private static readonly CREATE_COOLDOWN_MS = 5000;

  constructor(
    private readonly allocator: ApplicationJourneyAllocator,
    private readonly resolveStore: (placementId: string) => WindowPresentationStore,
    private readonly cacheTelemetry?: LivePageCacheTelemetry,
    private readonly now: () => number = Date.now
  ) {}

  openReference(update: OpenReferenceCommand): OpenReferenceResult | undefined {
    const store = this.resolveStore(update.placementId);
    if (!store.acceptPlacementUpdate(update)) {
      log.debug(
        `[${update.placementId}] Ignoring stale placement update generation ${update.placementGeneration}`,
        "BrowserPresentationCoordinator"
      );
      return undefined;
    }

    const handleId =
      this.allocator.getHandleIdForPlacement(update.placementId) ??
      update.placementId;
    const existing = store.getWorld().get(handleId);
    const activeMapping = this.allocator.getActiveMapping(update.placementId);
    const diagnostics = this.allocator.getDiagnostics(
      update.profileId,
      update.url
    );

    if (
      existing &&
      activeMapping?.routeId === update.routeId &&
      activeMapping.transitionGeneration === update.transitionGeneration
    ) {
      return this.updateExistingReference(
        store,
        update,
        handleId,
        existing,
        diagnostics
      );
    }

    if (existing && activeMapping) {
      log.debug(
        `[${update.placementId}] Releasing previous slot occupant: ${JSON.stringify(activeMapping)}`,
        "BrowserPresentationCoordinator"
      );
      store.detachHandle(handleId);
      this.destroyEvictedViews(
        store,
        this.allocator.markDetached(handleId)
      );
      store.publishLiveReferences();
    }

    const corePlan = this.allocator.planOpenReference({
      placementId: update.placementId,
      referenceId: update.referenceId,
      profileId: update.profileId,
      url: update.url,
    });
    const reusableView =
      corePlan.type === "reuse-current" || corePlan.type === "reuse-history"
        ? this.allocator.getHandle(corePlan.handleId)
        : undefined;
    const execution = decideOpenReferenceExecution(
      corePlan,
      diagnostics,
      Boolean(reusableView && !reusableView.webContents.isDestroyed())
    );

    if (execution.type === "reuse-current") {
      const previousStore = this.storeByHandleId.get(execution.plan.handleId);
      if (previousStore && previousStore !== store) {
        previousStore.forgetHandle(execution.plan.handleId);
      }
      store.adoptHandle(execution.plan.handleId, update);
      this.storeByHandleId.set(execution.plan.handleId, store);
      const targetIndex =
        execution.plan.type === "reuse-history"
          ? execution.plan.historyIndex
          : undefined;
      const prepared = store.prepareNavigationEntry(
        execution.plan.handleId,
        execution.plan.requestedUrl,
        targetIndex
      );
      if (!prepared) {
        this.allocator.releaseReservation(execution.plan);
        this.allocator.forgetHistoryAssociation(
          execution.plan.handleId,
          execution.plan.requestedUrl
        );
        return this.createReference(
          store,
          update,
          diagnostics,
          "stale_association"
        );
      }

      if (store.attachHandle(execution.plan.handleId)) {
        this.allocator.activateReservation(execution.plan, {
          placementId: update.placementId,
          routeId: update.routeId,
          transitionGeneration: update.transitionGeneration,
        });
        store.updatePlacementBounds(execution.plan.handleId, update);
        this.notifyPlacementReady(store, update);
        store.publishLiveReferences();
        return this.finishCacheAttempt(update, diagnostics, {
          journeyId: execution.plan.journeyId,
          outcome:
            execution.plan.type === "reuse-history"
              ? "hit_history"
              : "hit_current",
          loadAvoided: true,
        });
      }

      this.discardJourney(store, execution.plan.handleId);
      this.pendingCreates.delete(update.placementId);
      return this.createReference(store, update, diagnostics, "attach_failed");
    }

    if (execution.staleHandleId) {
      this.discardJourney(store, execution.staleHandleId);
    }
    return this.createReference(
      store,
      update,
      diagnostics,
      execution.missReason
    );
  }

  detachPlacement(command: DetachPlacementCommand): void {
    const store = this.resolveStore(command.placementId);
    if (!store.acceptPlacementDetach(command)) {
      log.debug(
        `[${command.placementId}] Ignoring stale detach generations ${JSON.stringify(command)}`,
        "BrowserPresentationCoordinator"
      );
      return;
    }
    const handleId = this.allocator.getHandleIdForPlacement(
      command.placementId
    );
    if (!handleId) return;
    if (!this.allocator.hasJourney(handleId)) {
      this.removePlacement(command.placementId);
      return;
    }

    store.detachHandle(handleId);
    this.destroyEvictedViews(store, this.allocator.markDetached(handleId));
    store.publishLiveReferences();
  }

  removePlacement(placementId: string): void {
    const store = this.resolveStore(placementId);
    this.pendingCreates.delete(placementId);
    store.retirePlacement(placementId);
    const handleId = this.allocator.getHandleIdForPlacement(placementId);
    if (!handleId) return;
    const wasLive = this.allocator.removeJourney(handleId);
    const ownerStore = this.storeByHandleId.get(handleId) ?? store;
    ownerStore.removeHandle(handleId);
    this.storeByHandleId.delete(handleId);
    if (wasLive) store.publishLiveReferences();
  }

  getLivePagesProjection() {
    return this.allocator.getLivePagesProjection();
  }

  private updateExistingReference(
    store: WindowPresentationStore,
    update: OpenReferenceCommand,
    handleId: string,
    existing: ViewEntry,
    diagnostics: ReturnType<ApplicationJourneyAllocator["getDiagnostics"]>
  ): OpenReferenceResult | undefined {
    if (!this.allocator.isDetached(handleId)) {
      store.updatePlacementBounds(handleId, update, existing);
      return undefined;
    }

    const historyMatch = this.allocator.resolveHistory(
      update.profileId,
      update.url
    );
    const targetIndex =
      historyMatch?.handleId === handleId
        ? historyMatch.historyIndex
        : undefined;
    if (!store.prepareNavigationEntry(handleId, update.url, targetIndex)) {
      this.discardJourney(store, handleId);
      this.pendingCreates.delete(update.placementId);
      return this.createReference(
        store,
        update,
        diagnostics,
        "stale_association"
      );
    }
    if (!store.attachHandle(handleId)) {
      this.discardJourney(store, handleId);
      this.pendingCreates.delete(update.placementId);
      return this.createReference(store, update, diagnostics, "attach_failed");
    }

    this.allocator.markVisible(handleId, {
      placementId: update.placementId,
      routeId: update.routeId,
      transitionGeneration: update.transitionGeneration,
    });
    store.updatePlacementBounds(handleId, update, existing);
    this.notifyPlacementReady(store, update);
    store.publishLiveReferences();
    return this.finishCacheAttempt(update, diagnostics, {
      journeyId: this.allocator.getJourneyId(handleId),
      outcome: targetIndex === undefined ? "hit_current" : "hit_history",
      loadAvoided: true,
    });
  }

  private createReference(
    store: WindowPresentationStore,
    update: OpenReferenceCommand,
    diagnostics: ReturnType<ApplicationJourneyAllocator["getDiagnostics"]>,
    missReason: CacheMissReason
  ): OpenReferenceResult | undefined {
    const pending = this.pendingCreates.get(update.placementId);
    const now = this.now();
    if (
      pending?.url === update.url &&
      now - pending.timestamp <
        BrowserPresentationCoordinator.CREATE_COOLDOWN_MS &&
      this.allocator.getHandleIdForPlacement(update.placementId) !== undefined
    ) {
      return undefined;
    }
    this.pendingCreates.set(update.placementId, {
      url: update.url,
      timestamp: now,
    });

    const handleId = store.createHandle(update);
    this.storeByHandleId.set(handleId, store);
    const createdView = this.allocator.getHandle(handleId);
    const rendererAvailable = Boolean(
      createdView && !createdView.webContents.isDestroyed()
    );
    if (shouldRetainJourney(update.layout) && rendererAvailable) {
      this.destroyEvictedViews(
        store,
        this.allocator.addVisible(
          handleId,
          update.profileId,
          update.url,
          {
            placementId: update.placementId,
            routeId: update.routeId,
            transitionGeneration: update.transitionGeneration,
          },
          update.referenceId
        )
      );
      store.publishLiveReferences();
    }
    return this.finishCacheAttempt(update, diagnostics, {
      journeyId: this.allocator.getJourneyId(handleId),
      outcome: "miss",
      missReason: rendererAvailable ? missReason : "renderer_unavailable",
      loadAvoided: false,
    });
  }

  private discardJourney(store: WindowPresentationStore, handleId: string): void {
    this.allocator.removeJourney(handleId);
    const ownerStore = this.storeByHandleId.get(handleId) ?? store;
    ownerStore.removeHandle(handleId);
    this.storeByHandleId.delete(handleId);
    store.publishLiveReferences();
  }

  private destroyEvictedViews(store: WindowPresentationStore, handleIds: string[]): void {
    for (const handleId of handleIds) {
      log.debug(
        `[${handleId}] Evicting live page`,
        "BrowserPresentationCoordinator"
      );
      this.pendingCreates.delete(handleId);
      const ownerStore = this.storeByHandleId.get(handleId) ?? store;
      ownerStore.removeHandle(handleId);
      this.storeByHandleId.delete(handleId);
    }
  }

  private notifyPlacementReady(
    store: WindowPresentationStore,
    update: OpenReferenceCommand
  ): void {
    const mapping = this.allocator.getActiveMapping(update.placementId);
    if (
      !mapping ||
      mapping.routeId !== update.routeId ||
      mapping.transitionGeneration !== update.transitionGeneration
    ) {
      log.error(
        `[${update.placementId}] Refusing contradictory ready notification`,
        "BrowserPresentationCoordinator"
      );
      return;
    }
    store.notifyPlacementReady(mapping);
  }

  private finishCacheAttempt(
    update: OpenReferenceCommand,
    diagnostics: ReturnType<ApplicationJourneyAllocator["getDiagnostics"]>,
    result: OpenReferenceResult
  ): OpenReferenceResult {
    if (this.cacheTelemetry && update.layout === "full") {
      const finalDiagnostics = this.allocator.getDiagnostics(
        update.profileId,
        update.url
      );
      const attempt: CacheAttempt = {
        profileId: update.profileId,
        referenceKind: update.referenceKind,
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
        log.warn(
          `Failed to record live page cache attempt: ${error}`,
          "BrowserPresentationCoordinator"
        );
      }
    }
    return result;
  }
}
