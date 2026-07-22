import { PlacementGenerationStore } from "./PlacementGenerationStore";

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
    for (let seed = 1; seed <= 100; seed += 1) {
      let state = seed >>> 0;
      const random = (max: number) => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state % max;
      };
      const generations = new PlacementGenerationStore();
      let newestActive = 0;
      let highestSeen = 0;

      for (let step = 0; step < 500; step += 1) {
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
