import { BrowsingJourneyStore } from "./BrowsingJourneyStore";
import { PlacementGenerationStore } from "./PlacementGenerationStore";
import { DeterministicScheduler } from "../testing/DeterministicScheduler";
import { getFuzzConfig, seededIndex } from "../testing/FuzzConfig";

type LifecycleEvent =
  | {
      type: "update";
      placementGeneration: number;
      transitionGeneration: number;
    }
  | {
      type: "detach";
      placementGeneration: number;
      transitionGeneration: number;
      deliberatelyMismatched?: boolean;
    };

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
      let newestPlacementGeneration = 0;
      let newestTransitionGeneration = 0;
      let expectedVisible = true;

      const deliver = (event: LifecycleEvent) => {
        if (event.type === "update") {
          if (
            generations.acceptUpdate(
              "page:full",
              event.placementGeneration,
              event.transitionGeneration
            )
          ) {
            journeys.markVisible("handle", "page:full");
            expectedVisible = true;
          }
        } else {
          const accepted = generations.acceptDetach(
            "page:full",
            event.placementGeneration,
            event.transitionGeneration
          );
          if (event.deliberatelyMismatched) {
            expect(accepted).toBe(false);
          }
          if (accepted) {
            journeys.markDetached("handle");
            expectedVisible = false;
          }
        }

        expect(journeys.isDetached("handle")).toBe(!expectedVisible);
      };

      for (let step = 0; step < operationCount; step += 1) {
        if (random(2) === 0) {
          const previousPlacementGeneration = newestPlacementGeneration;
          const previousTransitionGeneration = newestTransitionGeneration;
          newestPlacementGeneration += 1;
          newestTransitionGeneration += random(3) + 1;
          const update: LifecycleEvent = {
            type: "update",
            placementGeneration: newestPlacementGeneration,
            transitionGeneration: newestTransitionGeneration,
          };
          scheduler.enqueue(
            "renderer-ipc",
            `update-${newestPlacementGeneration}-${newestTransitionGeneration}`,
            () => deliver(update)
          );
          if (previousPlacementGeneration > 0) {
            const oldDetach: LifecycleEvent = {
              type: "detach",
              placementGeneration: previousPlacementGeneration,
              transitionGeneration: previousTransitionGeneration,
            };
            scheduler.enqueue(
              "renderer-ipc",
              `detach-${previousPlacementGeneration}-${previousTransitionGeneration}`,
              () => deliver(oldDetach)
            );
            const stalePlacement: LifecycleEvent = {
              type: "detach",
              placementGeneration: previousPlacementGeneration,
              transitionGeneration: newestTransitionGeneration,
              deliberatelyMismatched: true,
            };
            scheduler.enqueue(
              "renderer-ipc",
              `detach-mixed-${previousPlacementGeneration}-${newestTransitionGeneration}`,
              () => deliver(stalePlacement)
            );
            const staleTransition: LifecycleEvent = {
              type: "detach",
              placementGeneration: newestPlacementGeneration,
              transitionGeneration: previousTransitionGeneration,
              deliberatelyMismatched: true,
            };
            scheduler.enqueue(
              "renderer-ipc",
              `detach-mixed-${newestPlacementGeneration}-${previousTransitionGeneration}`,
              () => deliver(staleTransition)
            );
          }
        }

        scheduler.deliverRandom(random);
      }
      while (scheduler.size > 0) scheduler.deliverRandom(random);
    }
  });
});
