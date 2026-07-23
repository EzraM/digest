import type { WebContentsView } from "electron";
import { HandleRegistry } from "../domains/browser-views/adapter/HandleRegistry";
import type { LivePagesProjection } from "../types/browser";
import {
  BrowsingJourneyStore,
  type OpenReferencePlan,
  type PlacementActivation,
} from "./BrowsingJourneyStore";
import { LivePageProjectionStore } from "./LivePageProjectionStore";

/**
 * Application-scoped owner of live browsing journeys and their native handles.
 *
 * Window presentation stores may perform native attachment effects, but they
 * do not own or independently search the journey pool. All selection,
 * reservation, activation, retention, and placement mappings pass through this
 * object.
 */
export class ApplicationJourneyAllocator {
  private readonly journeys: BrowsingJourneyStore;
  private readonly handles: HandleRegistry;
  private readonly livePages: LivePageProjectionStore;
  private readonly livePageListeners = new Set<
    (projection: LivePagesProjection) => void
  >();

  constructor({
    journeys = new BrowsingJourneyStore(10),
    handles = new HandleRegistry(),
    livePages = new LivePageProjectionStore(),
  }: {
    journeys?: BrowsingJourneyStore;
    handles?: HandleRegistry;
    livePages?: LivePageProjectionStore;
  } = {}) {
    this.journeys = journeys;
    this.handles = handles;
    this.livePages = livePages;
  }

  getHandleRegistry(): HandleRegistry {
    return this.handles;
  }

  getHandle(handleId: string): WebContentsView | undefined {
    return this.handles.get(handleId);
  }

  hasHandle(handleId: string): boolean {
    return this.handles.has(handleId);
  }

  hasJourney(handleId: string): boolean {
    return this.journeys.has(handleId);
  }

  planOpenReference(input: {
    placementId: string;
    referenceId: string;
    profileId: string;
    url: string;
  }): OpenReferencePlan {
    return this.journeys.planOpenReference(input);
  }

  activateReservation(
    plan: Extract<OpenReferencePlan, { type: "reuse-current" | "reuse-history" }>,
    activation: PlacementActivation
  ): void {
    this.journeys.activatePlacement(plan, activation);
  }

  releaseReservation(
    plan: Extract<OpenReferencePlan, { type: "reuse-current" | "reuse-history" }>
  ): boolean {
    return this.journeys.releaseReservation(plan);
  }

  addVisible(
    handleId: string,
    profileId: string,
    url: string,
    activation: PlacementActivation,
    referenceId?: string
  ): string[] {
    return this.journeys.addVisible(
      handleId,
      profileId,
      url,
      activation,
      referenceId
    );
  }

  markVisible(handleId: string, activation: PlacementActivation): void {
    this.journeys.markVisible(handleId, activation);
  }

  markDetached(handleId: string): string[] {
    return this.journeys.markDetached(handleId);
  }

  removeJourney(handleId: string): boolean {
    return this.journeys.remove(handleId);
  }

  isDetached(handleId: string): boolean {
    return this.journeys.isDetached(handleId);
  }

  recordNavigation(
    handleId: string,
    url: string,
    historyIndex?: number
  ): void {
    this.journeys.recordNavigation(handleId, url, historyIndex);
  }

  forgetHistoryAssociation(handleId: string, url: string): void {
    this.journeys.forgetHistoryAssociation(handleId, url);
  }

  resolveHistory(profileId: string, url: string) {
    return this.journeys.resolveHistory(profileId, url);
  }

  getDiagnostics(profileId: string, url: string) {
    return this.journeys.getDiagnostics(profileId, url);
  }

  getActiveMapping(placementId: string) {
    return this.journeys.getActiveMapping(placementId);
  }

  getActiveMappingForHandle(handleId: string) {
    return this.journeys.getActiveMappingForHandle(handleId);
  }

  getActivePlacementId(handleId: string): string {
    return this.journeys.getActivePlacementId(handleId);
  }

  getHandleIdForPlacement(placementId: string): string | undefined {
    return this.journeys.getHandleIdForPlacement(placementId);
  }

  getJourneyId(handleId: string): string | undefined {
    return this.journeys.getJourneyId(handleId);
  }

  getLiveReferences(): Array<{ profileId: string; url: string }> {
    return this.journeys.getLiveReferences();
  }

  syncLivePages(): LivePagesProjection | undefined {
    const projection = this.livePages.sync(this.getLiveReferences());
    if (projection) {
      for (const listener of this.livePageListeners) listener(projection);
    }
    return projection;
  }

  getLivePagesProjection(): LivePagesProjection {
    return this.livePages.getSnapshot();
  }

  subscribeLivePages(
    listener: (projection: LivePagesProjection) => void
  ): () => void {
    this.livePageListeners.add(listener);
    return () => this.livePageListeners.delete(listener);
  }
}
