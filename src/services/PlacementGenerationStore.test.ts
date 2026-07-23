import { PlacementGenerationStore } from "./PlacementGenerationStore";
import { getFuzzConfig, seededIndex } from "../testing/FuzzConfig";

describe("PlacementGenerationStore", () => {
  it("rejects cleanup from an older React mount", () => {
    const generations = new PlacementGenerationStore();

    expect(generations.acceptUpdate("page:full", 1, 1)).toBe(true);
    expect(generations.acceptUpdate("page:full", 2, 2)).toBe(true);
    expect(generations.acceptDetach("page:full", 1, 1)).toBe(false);
    expect(generations.acceptDetach("page:full", 2, 2)).toBe(true);
    expect(generations.acceptUpdate("page:full", 2, 2)).toBe(false);
    expect(generations.acceptUpdate("page:full", 3, 3)).toBe(true);
  });

  it("rejects a command when either generation is stale", () => {
    const generations = new PlacementGenerationStore();

    expect(generations.acceptUpdate("page:full", 10, 20)).toBe(true);
    expect(generations.acceptUpdate("page:full", 11, 19)).toBe(false);
    expect(generations.acceptUpdate("page:full", 9, 21)).toBe(false);
    expect(generations.acceptDetach("page:full", 10, 19)).toBe(false);
    expect(generations.acceptDetach("page:full", 10, 20)).toBe(true);
  });

  it("survives randomized delivery while preserving the newest mount", () => {
    const { firstSeed, seedCount, operationCount } = getFuzzConfig();
    for (let seed = firstSeed; seed < firstSeed + seedCount; seed += 1) {
      const random = seededIndex(seed);
      const generations = new PlacementGenerationStore();
      let active:
        | { placementGeneration: number; transitionGeneration: number }
        | undefined;
      let highestPlacement = 0;
      let highestTransition = 0;

      for (let step = 0; step < operationCount; step += 1) {
        const placementGeneration = random(20) + 1;
        const transitionGeneration = random(20) + 1;
        if (random(3) < 2) {
          const accepted = generations.acceptUpdate(
            "page:full",
            placementGeneration,
            transitionGeneration
          );
          const duplicatesActive =
            active?.placementGeneration === placementGeneration &&
            active.transitionGeneration === transitionGeneration;
          const advancesBoth =
            placementGeneration > highestPlacement &&
            transitionGeneration > highestTransition;
          expect(accepted).toBe(duplicatesActive || advancesBoth);
          if (
            accepted &&
            !duplicatesActive
          ) {
            active = { placementGeneration, transitionGeneration };
            highestPlacement = placementGeneration;
            highestTransition = transitionGeneration;
          }
        } else {
          const accepted = generations.acceptDetach(
            "page:full",
            placementGeneration,
            transitionGeneration
          );
          const matchesActive =
            active?.placementGeneration === placementGeneration &&
            active.transitionGeneration === transitionGeneration;
          expect(accepted).toBe(matchesActive);
          if (accepted) active = undefined;
        }
      }
    }
  });
});
