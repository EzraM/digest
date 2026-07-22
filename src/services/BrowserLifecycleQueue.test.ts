import { BrowsingJourneyStore } from "./BrowsingJourneyStore";
import { PlacementGenerationStore } from "./PlacementGenerationStore";
import { DeterministicScheduler } from "../testing/DeterministicScheduler";
import { getFuzzConfig, seededIndex } from "../testing/FuzzConfig";

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
    const { firstSeed, seedCount, operationCount } = getFuzzConfig();
    for (let seed = firstSeed; seed < firstSeed + seedCount; seed += 1) {
      const random = seededIndex(seed);
      const generations = new PlacementGenerationStore();
      const journeys = new BrowsingJourneyStore(2, () => `journey-${seed}`);
      journeys.addVisible(
        "handle",
        "profile",
        "https://example.test/",
        "reference"
      );
      const scheduler = new DeterministicScheduler();
      let newestGeneration = 0;
      let expectedVisible = true;

      const deliver = (event: LifecycleEvent) => {
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
      };

      for (let step = 0; step < operationCount; step += 1) {
        if (random(2) === 0) {
          newestGeneration += 1;
          const update: LifecycleEvent = {
            type: "update",
            generation: newestGeneration,
          };
          scheduler.enqueue(
            "renderer-ipc",
            `update-${newestGeneration}`,
            () => deliver(update)
          );
          if (newestGeneration > 1) {
            const detach: LifecycleEvent = {
              type: "detach",
              generation: newestGeneration - 1,
            };
            scheduler.enqueue(
              "renderer-ipc",
              `detach-${newestGeneration - 1}`,
              () => deliver(detach)
            );
          }
        }

        scheduler.deliverRandom(random);
      }
    }
  });
});
