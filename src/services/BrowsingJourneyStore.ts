import { randomUUID } from "node:crypto";

export type JourneyPlacement = "visible" | "detached";

export type BrowsingJourney = {
  journeyId: string;
  handleId: string;
  profileId: string;
  currentUrl: string;
  placement: JourneyPlacement;
  lastUsedAt: number;
  referenceIds: Set<string>;
  normalizedUrls: Set<string>;
  historyIndexByNormalizedUrl: Map<string, number>;
};

export type JourneyMatch = {
  journeyId: string;
  handleId: string;
  profileId: string;
  currentUrl: string;
};

export type JourneyAssociationMatch = JourneyMatch & {
  isCurrentDocument: boolean;
};

export type ActiveJourneyMapping = {
  placementId: string;
  journeyId: string;
  handleId: string;
};

export type OpenReferencePlan =
  | {
      type: "reuse-current";
      journeyId: string;
      handleId: string;
      placementId: string;
      referenceId: string;
      requestedUrl: string;
    }
  | {
      type: "reuse-history";
      journeyId: string;
      handleId: string;
      placementId: string;
      referenceId: string;
      requestedUrl: string;
      historyIndex: number;
    }
  | {
      type: "create";
      placementId: string;
      reason: "no-current-association" | "matching-journey-visible";
    };

export type JourneyCacheDiagnostics = {
  candidateCount: number;
  cacheSize: number;
  detachedCount: number;
  hasCrossProfileMatch: boolean;
};

export type LiveReference = {
  profileId: string;
  url: string;
};

/**
 * Serialize a URL without removing application-significant state. URL performs
 * only syntax-level normalization (for example, casing the host and removing a
 * default port) while retaining path, query, and fragment.
 */
export function normalizeJourneyUrl(url: string): string {
  const trimmed = url.trim();
  try {
    return new URL(trimmed).href;
  } catch {
    return trimmed;
  }
}

/**
 * Owns journey identity, placement, URL associations, and bounded LRU policy.
 * Electron handles remain in HandleRegistry and are addressed by handleId.
 */
export class BrowsingJourneyStore {
  private journeys = new Map<string, BrowsingJourney>();
  private journeyIdByHandle = new Map<string, string>();
  private journeyIdsByProfileUrl = new Map<string, Set<string>>();
  private handleIdByPlacementId = new Map<string, string>();
  private activePlacementIdByHandleId = new Map<string, string>();
  private clock = 0;

  constructor(
    private readonly limitPerProfile = 10,
    private readonly createId: () => string = randomUUID
  ) {}

  addVisible(
    handleId: string,
    profileId: string,
    url: string,
    referenceId?: string
  ): string[] {
    const existing = this.getByHandle(handleId);
    if (existing) {
      existing.placement = "visible";
      existing.lastUsedAt = this.nextTimestamp();
      this.bindPlacement(handleId, handleId);
      if (referenceId) existing.referenceIds.add(referenceId);
      this.associateUrl(existing, url);
      return this.enforceLimit(profileId);
    }

    const journey: BrowsingJourney = {
      journeyId: this.createId(),
      handleId,
      profileId,
      currentUrl: url,
      placement: "visible",
      lastUsedAt: this.nextTimestamp(),
      referenceIds: new Set(referenceId ? [referenceId] : []),
      normalizedUrls: new Set(),
      historyIndexByNormalizedUrl: new Map(),
    };
    this.journeys.set(journey.journeyId, journey);
    this.journeyIdByHandle.set(handleId, journey.journeyId);
    this.activePlacementIdByHandleId.set(handleId, handleId);
    this.associateUrl(journey, url);
    return this.enforceLimit(profileId);
  }

  markVisible(handleId: string, placementId = handleId): void {
    const journey = this.getByHandle(handleId);
    if (!journey) return;
    journey.placement = "visible";
    journey.lastUsedAt = this.nextTimestamp();
    this.bindPlacement(handleId, placementId);
  }

  planOpenReference(input: {
    placementId: string;
    referenceId: string;
    profileId: string;
    url: string;
  }): OpenReferencePlan {
    const reusable = this.resolveCurrent(input.profileId, input.url);
    const historyReusable = reusable
      ? undefined
      : this.resolveHistory(input.profileId, input.url);
    const candidate = reusable ?? historyReusable;
    if (!candidate) {
      return {
        type: "create",
        placementId: input.placementId,
        reason: "no-current-association",
      };
    }
    if (!this.isDetached(candidate.handleId)) {
      return {
        type: "create",
        placementId: input.placementId,
        reason: "matching-journey-visible",
      };
    }
    const base = {
      journeyId: candidate.journeyId,
      handleId: candidate.handleId,
      placementId: input.placementId,
      referenceId: input.referenceId,
      requestedUrl: input.url,
    };
    return historyReusable
      ? {
          ...base,
          type: "reuse-history",
          historyIndex: historyReusable.historyIndex,
        }
      : { ...base, type: "reuse-current" };
  }

  activatePlacement(
    plan: Extract<OpenReferencePlan, { type: "reuse-current" | "reuse-history" }>
  ): void {
    const journey = this.getByHandle(plan.handleId);
    if (!journey || journey.journeyId !== plan.journeyId) return;
    this.bindPlacement(plan.handleId, plan.placementId);
    journey.referenceIds.add(plan.referenceId);
    journey.placement = "visible";
    journey.lastUsedAt = this.nextTimestamp();
  }

  getHandleIdForPlacement(placementId: string): string | undefined {
    return this.handleIdByPlacementId.get(placementId);
  }

  getActivePlacementId(handleId: string): string {
    return this.activePlacementIdByHandleId.get(handleId) ?? handleId;
  }

  getJourneyId(handleId: string): string | undefined {
    return this.getByHandle(handleId)?.journeyId;
  }

  getActiveMapping(placementId: string): ActiveJourneyMapping | undefined {
    const handleId = this.handleIdByPlacementId.get(placementId);
    if (!handleId) return undefined;
    const journeyId = this.journeyIdByHandle.get(handleId);
    if (!journeyId) return undefined;
    if (this.activePlacementIdByHandleId.get(handleId) !== placementId) {
      return undefined;
    }
    return { placementId, journeyId, handleId };
  }

  getDiagnostics(profileId: string, url: string): JourneyCacheDiagnostics {
    const normalizedUrl = normalizeJourneyUrl(url);
    const profileJourneys = Array.from(this.journeys.values()).filter(
      (journey) => journey.profileId === profileId
    );
    return {
      candidateCount: profileJourneys.filter((journey) =>
        journey.normalizedUrls.has(normalizedUrl)
      ).length,
      cacheSize: profileJourneys.length,
      detachedCount: profileJourneys.filter(
        (journey) => journey.placement === "detached"
      ).length,
      hasCrossProfileMatch: Array.from(this.journeys.values()).some(
        (journey) =>
          journey.profileId !== profileId &&
          journey.normalizedUrls.has(normalizedUrl)
      ),
    };
  }

  markDetached(handleId: string): string[] {
    const journey = this.getByHandle(handleId);
    if (!journey) return [];
    journey.placement = "detached";
    journey.lastUsedAt = this.nextTimestamp();
    const activePlacementId = this.activePlacementIdByHandleId.get(handleId);
    if (activePlacementId) {
      this.handleIdByPlacementId.delete(activePlacementId);
      this.activePlacementIdByHandleId.delete(handleId);
    }
    return this.enforceLimit(journey.profileId);
  }

  recordNavigation(handleId: string, url: string, historyIndex?: number): void {
    const journey = this.getByHandle(handleId);
    if (!journey) return;
    this.associateUrl(journey, url, historyIndex);
  }

  forgetHistoryAssociation(handleId: string, url: string): void {
    this.getByHandle(handleId)?.historyIndexByNormalizedUrl.delete(
      normalizeJourneyUrl(url)
    );
  }

  /**
   * Resolve the most recently used journey associated with a URL.
   *
   * An association is not necessarily safe to attach directly: the journey may
   * have navigated away since visiting the requested URL. Callers must inspect
   * isCurrentDocument and treat older-page associations as history candidates.
   */
  resolveAssociation(
    profileId: string,
    url: string
  ): JourneyAssociationMatch | undefined {
    const ids = this.journeyIdsByProfileUrl.get(this.urlKey(profileId, url));
    if (!ids) return undefined;

    const journey = Array.from(ids, (id) => this.journeys.get(id))
      .filter((entry): entry is BrowsingJourney => Boolean(entry))
      .sort((a, b) => b.lastUsedAt - a.lastUsedAt)[0];
    if (!journey) return undefined;

    return {
      journeyId: journey.journeyId,
      handleId: journey.handleId,
      profileId: journey.profileId,
      currentUrl: journey.currentUrl,
      isCurrentDocument:
        normalizeJourneyUrl(journey.currentUrl) === normalizeJourneyUrl(url),
    };
  }

  /** Resolve only a journey whose current live document is the requested URL. */
  resolveCurrent(profileId: string, url: string): JourneyMatch | undefined {
    const ids = this.journeyIdsByProfileUrl.get(this.urlKey(profileId, url));
    if (!ids) return undefined;

    const normalizedUrl = normalizeJourneyUrl(url);
    const journey = Array.from(ids, (id) => this.journeys.get(id))
      .filter(
        (entry): entry is BrowsingJourney =>
          entry !== undefined &&
          normalizeJourneyUrl(entry.currentUrl) === normalizedUrl
      )
      .sort((a, b) => b.lastUsedAt - a.lastUsedAt)[0];
    if (!journey) return undefined;

    return {
      journeyId: journey.journeyId,
      handleId: journey.handleId,
      profileId: journey.profileId,
      currentUrl: journey.currentUrl,
    };
  }

  /** Resolve a previously visited entry that is no longer the current document. */
  resolveHistory(
    profileId: string,
    url: string
  ): (JourneyMatch & { historyIndex: number }) | undefined {
    const normalizedUrl = normalizeJourneyUrl(url);
    const ids = this.journeyIdsByProfileUrl.get(this.urlKey(profileId, url));
    if (!ids) return undefined;

    const journey = Array.from(ids, (id) => this.journeys.get(id))
      .filter(
        (entry): entry is BrowsingJourney =>
          entry !== undefined &&
          normalizeJourneyUrl(entry.currentUrl) !== normalizedUrl &&
          entry.historyIndexByNormalizedUrl.has(normalizedUrl)
      )
      .sort((a, b) => b.lastUsedAt - a.lastUsedAt)[0];
    const historyIndex = journey?.historyIndexByNormalizedUrl.get(normalizedUrl);
    if (!journey || historyIndex === undefined) return undefined;

    return {
      journeyId: journey.journeyId,
      handleId: journey.handleId,
      profileId: journey.profileId,
      currentUrl: journey.currentUrl,
      historyIndex,
    };
  }

  remove(handleId: string): boolean {
    const journey = this.getByHandle(handleId);
    if (!journey) return false;
    this.removeJourney(journey);
    return true;
  }

  has(handleId: string): boolean {
    return this.journeyIdByHandle.has(handleId);
  }

  isDetached(handleId: string): boolean {
    return this.getByHandle(handleId)?.placement === "detached";
  }

  getLiveReferenceIds(): string[] {
    return Array.from(
      new Set(
        Array.from(this.journeys.values()).flatMap((journey) =>
          Array.from(journey.referenceIds)
        )
      )
    );
  }

  /** Runtime-only projection of pages that can be resumed without loading. */
  getLiveReferences(): LiveReference[] {
    const references = new Map<string, LiveReference>();
    for (const journey of this.journeys.values()) {
      const url = normalizeJourneyUrl(journey.currentUrl);
      references.set(this.urlKey(journey.profileId, url), {
        profileId: journey.profileId,
        url,
      });
    }
    return Array.from(references.values());
  }

  private getByHandle(handleId: string): BrowsingJourney | undefined {
    const journeyId = this.journeyIdByHandle.get(handleId);
    return journeyId ? this.journeys.get(journeyId) : undefined;
  }

  private associateUrl(
    journey: BrowsingJourney,
    url: string,
    historyIndex?: number
  ): void {
    journey.currentUrl = url;
    const normalizedUrl = normalizeJourneyUrl(url);
    if (historyIndex !== undefined) {
      journey.historyIndexByNormalizedUrl.set(normalizedUrl, historyIndex);
    }
    if (journey.normalizedUrls.has(normalizedUrl)) return;
    journey.normalizedUrls.add(normalizedUrl);
    const key = this.urlKey(journey.profileId, normalizedUrl);
    const ids = this.journeyIdsByProfileUrl.get(key) ?? new Set<string>();
    ids.add(journey.journeyId);
    this.journeyIdsByProfileUrl.set(key, ids);
  }

  private enforceLimit(profileId: string): string[] {
    const evicted: string[] = [];
    const profileJourneys = () =>
      Array.from(this.journeys.values()).filter(
        (journey) => journey.profileId === profileId
      );

    while (profileJourneys().length > this.limitPerProfile) {
      const candidate = profileJourneys()
        .filter((journey) => journey.placement === "detached")
        .sort((a, b) => a.lastUsedAt - b.lastUsedAt)[0];
      if (!candidate) break;
      this.removeJourney(candidate);
      evicted.push(candidate.handleId);
    }
    return evicted;
  }

  private removeJourney(journey: BrowsingJourney): void {
    this.journeys.delete(journey.journeyId);
    this.journeyIdByHandle.delete(journey.handleId);
    this.activePlacementIdByHandleId.delete(journey.handleId);
    for (const [placementId, handleId] of this.handleIdByPlacementId) {
      if (handleId === journey.handleId) {
        this.handleIdByPlacementId.delete(placementId);
      }
    }
    for (const normalizedUrl of journey.normalizedUrls) {
      const key = this.urlKey(journey.profileId, normalizedUrl);
      const ids = this.journeyIdsByProfileUrl.get(key);
      ids?.delete(journey.journeyId);
      if (ids?.size === 0) this.journeyIdsByProfileUrl.delete(key);
    }
  }

  /** Keep the handle/placement relationship one-to-one across stale events. */
  private bindPlacement(handleId: string, placementId: string): void {
    const previousPlacement = this.activePlacementIdByHandleId.get(handleId);
    if (previousPlacement && previousPlacement !== placementId) {
      this.handleIdByPlacementId.delete(previousPlacement);
    }

    const previousHandle = this.handleIdByPlacementId.get(placementId);
    if (previousHandle && previousHandle !== handleId) {
      this.activePlacementIdByHandleId.delete(previousHandle);
    }

    this.handleIdByPlacementId.set(placementId, handleId);
    this.activePlacementIdByHandleId.set(handleId, placementId);
  }

  private urlKey(profileId: string, url: string): string {
    return `${profileId}\u0000${normalizeJourneyUrl(url)}`;
  }

  private nextTimestamp(): number {
    this.clock += 1;
    return this.clock;
  }
}
