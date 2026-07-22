/**
 * Rejects delayed renderer messages from an older mount of the same placement.
 * Generations are monotonically increasing within the renderer process.
 */
export class PlacementGenerationStore {
  private activeByPlacement = new Map<string, number>();
  private highestSeenByPlacement = new Map<string, number>();

  acceptUpdate(placementId: string, generation?: number): boolean {
    if (generation === undefined) return true;
    const active = this.activeByPlacement.get(placementId);
    const highestSeen = this.highestSeenByPlacement.get(placementId);
    if (active === generation) return true;
    if (highestSeen !== undefined && generation <= highestSeen) return false;
    this.activeByPlacement.set(placementId, generation);
    this.highestSeenByPlacement.set(placementId, generation);
    return true;
  }

  acceptDetach(placementId: string, generation?: number): boolean {
    if (generation === undefined) return true;
    if (this.activeByPlacement.get(placementId) !== generation) return false;
    this.activeByPlacement.delete(placementId);
    return true;
  }

  remove(placementId: string): void {
    this.activeByPlacement.delete(placementId);
  }
}
