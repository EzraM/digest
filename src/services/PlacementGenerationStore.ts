/**
 * Rejects delayed renderer messages from an older mount of the same placement.
 * Generations are monotonically increasing within the renderer process.
 */
export class PlacementGenerationStore {
  private activeByPlacement = new Map<
    string,
    { placementGeneration: number; transitionGeneration: number }
  >();
  private highestPlacementGeneration = new Map<string, number>();
  private highestTransitionGeneration = new Map<string, number>();

  acceptUpdate(
    placementId: string,
    placementGeneration: number,
    transitionGeneration: number
  ): boolean {
    const active = this.activeByPlacement.get(placementId);
    if (
      active?.placementGeneration === placementGeneration &&
      active.transitionGeneration === transitionGeneration
    ) {
      return true;
    }
    const highestPlacement = this.highestPlacementGeneration.get(placementId);
    const highestTransition =
      this.highestTransitionGeneration.get(placementId);
    if (
      (highestPlacement !== undefined &&
        placementGeneration <= highestPlacement) ||
      (highestTransition !== undefined &&
        transitionGeneration <= highestTransition)
    ) {
      return false;
    }
    this.activeByPlacement.set(placementId, {
      placementGeneration,
      transitionGeneration,
    });
    this.highestPlacementGeneration.set(placementId, placementGeneration);
    this.highestTransitionGeneration.set(placementId, transitionGeneration);
    return true;
  }

  acceptDetach(
    placementId: string,
    placementGeneration: number,
    transitionGeneration: number
  ): boolean {
    const active = this.activeByPlacement.get(placementId);
    if (
      active?.placementGeneration !== placementGeneration ||
      active.transitionGeneration !== transitionGeneration
    ) {
      return false;
    }
    this.activeByPlacement.delete(placementId);
    return true;
  }

  remove(placementId: string): void {
    this.activeByPlacement.delete(placementId);
  }
}
