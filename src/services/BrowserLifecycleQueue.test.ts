import { BrowsingJourneyStore } from "./BrowsingJourneyStore";
import { PlacementGenerationStore } from "./PlacementGenerationStore";

type LifecycleEvent =
  | { type: "update"; generation: number }
  | { type: "detach"; generation: number };

/**
 * Exercises the renderer-to-main boundary as a delayed queue: mount updates and
 * cleanup messages may be delivered out of order, while accepted messages drive
 * the same journey transitions used by ViewStore.
 */
describe("queued browser lifecycle", () => {
  it("never lets delayed cleanup detach a newer visible mount", () => {
    for (let seed = 1; seed <= 100; seed += 1) {
      let randomState = seed >>> 0;
      const random = (max: number) => {
        randomState =
          (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
        return randomState % max;
      };
      const generations = new PlacementGenerationStore();
      const journeys = new BrowsingJourneyStore(2, () => `journey-${seed}`);
      journeys.addVisible(
        "handle",
        "profile",
        "https://example.test/",
        "reference"
      );
      const queue: LifecycleEvent[] = [];
      let newestGeneration = 0;
      let expectedVisible = true;

      for (let step = 0; step < 500; step += 1) {
        if (random(2) === 0) {
          newestGeneration += 1;
          queue.push({ type: "update", generation: newestGeneration });
          if (newestGeneration > 1) {
            queue.push({ type: "detach", generation: newestGeneration - 1 });
          }
        }

        if (queue.length === 0) continue;
        const eventIndex = random(queue.length);
        const [event] = queue.splice(eventIndex, 1);
        if (event.type === "update") {
          if (generations.acceptUpdate("page:full", event.generation)) {
            journeys.markVisible("handle", "page:full");
            expectedVisible = true;
          }
        } else if (
          generations.acceptDetach("page:full", event.generation)
        ) {
          journeys.markDetached("handle");
          expectedVisible = false;
        }

        expect(journeys.isDetached("handle")).toBe(!expectedVisible);
      }
    }
  });
});
