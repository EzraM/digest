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
        {
          placementId: "handle",
          routeId: "route:initial",
          transitionGeneration: 1,
        },
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
            journeys.markVisible("handle", {
              placementId: "page:full",
              routeId: `route:${event.transitionGeneration}`,
              transitionGeneration: event.transitionGeneration,
            });
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
      const enqueue = (label: string, event: LifecycleEvent) => {
        scheduler.enqueue("renderer-ipc", label, () => deliver(event));
        if (random(3) === 0) {
          scheduler.enqueue("renderer-ipc", `${label}-duplicate`, () =>
            deliver(event)
          );
        }
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
          enqueue(
            `update-${newestPlacementGeneration}-${newestTransitionGeneration}`,
            update
          );
          if (previousPlacementGeneration > 0) {
            const oldDetach: LifecycleEvent = {
              type: "detach",
              placementGeneration: previousPlacementGeneration,
              transitionGeneration: previousTransitionGeneration,
            };
            enqueue(
              `detach-${previousPlacementGeneration}-${previousTransitionGeneration}`,
              oldDetach
            );
            const stalePlacement: LifecycleEvent = {
              type: "detach",
              placementGeneration: previousPlacementGeneration,
              transitionGeneration: newestTransitionGeneration,
              deliberatelyMismatched: true,
            };
            enqueue(
              `detach-mixed-${previousPlacementGeneration}-${newestTransitionGeneration}`,
              stalePlacement
            );
            const staleTransition: LifecycleEvent = {
              type: "detach",
              placementGeneration: newestPlacementGeneration,
              transitionGeneration: previousTransitionGeneration,
              deliberatelyMismatched: true,
            };
            enqueue(
              `detach-mixed-${newestPlacementGeneration}-${previousTransitionGeneration}`,
              staleTransition
            );
          }
        }

        scheduler.deliverRandom(random);
      }
      while (scheduler.size > 0) scheduler.deliverRandom(random);
    }
  });
});
