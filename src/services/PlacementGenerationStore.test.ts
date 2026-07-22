import { PlacementGenerationStore } from "./PlacementGenerationStore";
import { getFuzzConfig, seededIndex } from "../testing/FuzzConfig";

describe("PlacementGenerationStore", () => {
  it("rejects cleanup from an older React mount", () => {
    const generations = new PlacementGenerationStore();

    expect(generations.acceptUpdate("page:full", 1)).toBe(true);
    expect(generations.acceptUpdate("page:full", 2)).toBe(true);
    expect(generations.acceptDetach("page:full", 1)).toBe(false);
    expect(generations.acceptDetach("page:full", 2)).toBe(true);
    expect(generations.acceptUpdate("page:full", 2)).toBe(false);
    expect(generations.acceptUpdate("page:full", 3)).toBe(true);
  });

  it("survives randomized delivery while preserving the newest mount", () => {
    const { firstSeed, seedCount, operationCount } = getFuzzConfig();
    for (let seed = firstSeed; seed < firstSeed + seedCount; seed += 1) {
      const random = seededIndex(seed);
      const generations = new PlacementGenerationStore();
      let newestActive = 0;
      let highestSeen = 0;

      for (let step = 0; step < operationCount; step += 1) {
        const generation = random(20) + 1;
        if (random(3) < 2) {
          const accepted = generations.acceptUpdate("page:full", generation);
          if (
            generation > highestSeen ||
            (generation === newestActive && newestActive !== 0)
          ) {
            expect(accepted).toBe(true);
            newestActive = generation;
            highestSeen = Math.max(highestSeen, generation);
          } else {
            expect(accepted).toBe(false);
          }
        } else {
          const accepted = generations.acceptDetach("page:full", generation);
          expect(accepted).toBe(
            generation === newestActive && newestActive !== 0
          );
          if (accepted) newestActive = 0;
        }
      }
    }
  });
});
