import {
  BrowsingJourneyStore,
  normalizeJourneyUrl,
} from "./BrowsingJourneyStore";
import { getFuzzConfig, seededIndex } from "../testing/FuzzConfig";

const ids = () => {
  let next = 0;
  return () => `journey-${++next}`;
};

const activation = (placementId: string, transitionGeneration = 1) => ({
  placementId,
  routeId: `route:${placementId}`,
  transitionGeneration,
});

const addVisible = (
  store: BrowsingJourneyStore,
  handleId: string,
  profileId: string,
  url: string,
  referenceId?: string
) =>
  store.addVisible(
    handleId,
    profileId,
    url,
    activation(handleId),
    referenceId
  );

describe("BrowsingJourneyStore", () => {
  it("projects current live URLs by profile without journey identity", () => {
    const store = new BrowsingJourneyStore(2, ids());
    addVisible(store, "handle-1", "profile-a", "https://example.com/first");
    store.recordNavigation("handle-1", "https://example.com/current");
    addVisible(store, "handle-2", "profile-b", "https://example.com/current");

    expect(store.getLiveReferences()).toEqual([
      { profileId: "profile-a", url: "https://example.com/current" },
      { profileId: "profile-b", url: "https://example.com/current" },
    ]);
  });

  it("projects indexed history entries as resumable live URLs", () => {
    const store = new BrowsingJourneyStore(2, ids());
    addVisible(store, "handle-1", "profile-a", "https://example.com/first");
    store.recordNavigation("handle-1", "https://example.com/first", 0);
    store.recordNavigation("handle-1", "https://example.com/current", 1);

    expect(store.getLiveReferences()).toEqual([
      { profileId: "profile-a", url: "https://example.com/first" },
      { profileId: "profile-a", url: "https://example.com/current" },
    ]);

    store.forgetHistoryAssociation(
      "handle-1",
      "https://example.com/first"
    );
    expect(store.getLiveReferences()).toEqual([
      { profileId: "profile-a", url: "https://example.com/current" },
    ]);
  });

  it("evicts the least recently used detached journey per profile", () => {
    const store = new BrowsingJourneyStore(2, ids());
    addVisible(store, "a:full", "profile-a", "https://a.test", "a");
    store.markDetached("a:full");
    addVisible(store, "b:full", "profile-a", "https://b.test", "b");
    store.markDetached("b:full");

    expect(
      addVisible(store, "c:full", "profile-a", "https://c.test", "c")
    ).toEqual(["a:full"]);
    expect(store.getLiveReferenceIds()).toEqual(["b", "c"]);
  });

  it("never evicts a visible journey", () => {
    const store = new BrowsingJourneyStore(1, ids());
    addVisible(store, "a:full", "profile-a", "https://a.test", "a");
    expect(
      addVisible(store, "b:full", "profile-a", "https://b.test", "b")
    ).toEqual([]);
    expect(store.markDetached("a:full")).toEqual(["a:full"]);
  });

  it("scopes the limit and URL resolution by profile", () => {
    const store = new BrowsingJourneyStore(1, ids());
    addVisible(store, "a:full", "profile-a", "https://example.test", "a");
    store.markDetached("a:full");
    addVisible(store, "b:full", "profile-b", "https://example.test", "b");

    expect(store.getLiveReferenceIds()).toEqual(["a", "b"]);
    expect(
      store.resolveCurrent("profile-a", "https://example.test")?.handleId
    ).toBe("a:full");
    expect(
      store.resolveCurrent("profile-b", "https://example.test")?.handleId
    ).toBe("b:full");
  });

  it("indexes every URL visited by a journey", () => {
    const store = new BrowsingJourneyStore(2, ids());
    addVisible(store, "a:full", "profile-a", "https://a.test", "a");
    store.recordNavigation("a:full", "https://b.test/path?q=1#section");

    expect(
      store.resolveCurrent("profile-a", "https://b.test/path?q=1#section")
    ).toMatchObject({
      journeyId: "journey-1",
      handleId: "a:full",
      currentUrl: "https://b.test/path?q=1#section",
    });
  });

  it("keeps multiple same-URL journeys and resolves the most recent", () => {
    const store = new BrowsingJourneyStore(3, ids());
    addVisible(store, "a:full", "profile-a", "https://same.test", "a");
    store.markDetached("a:full");
    addVisible(store, "b:full", "profile-a", "https://same.test", "b");

    expect(
      store.resolveCurrent("profile-a", "https://same.test")?.handleId
    ).toBe("b:full");
    store.markVisible("a:full", activation("a:full", 2));
    expect(
      store.resolveCurrent("profile-a", "https://same.test")?.handleId
    ).toBe("a:full");
  });

  it("does not present an older visited URL as the current document", () => {
    const store = new BrowsingJourneyStore(2, ids());
    addVisible(store, "a:full", "profile-a", "https://a.test", "a");
    store.recordNavigation("a:full", "https://b.test");

    expect(store.resolveCurrent("profile-a", "https://a.test")).toBeUndefined();
    expect(
      store.resolveAssociation("profile-a", "https://a.test")
    ).toMatchObject({
      journeyId: "journey-1",
      handleId: "a:full",
      currentUrl: "https://b.test",
      isCurrentDocument: false,
    });
    expect(
      store.resolveAssociation("profile-a", "https://b.test")
    ).toMatchObject({ isCurrentDocument: true });
  });

  it("plans restoration of a recorded older history entry", () => {
    const store = new BrowsingJourneyStore(2, ids(), () => "request-1");
    addVisible(store, "a:full", "profile-a", "https://a.test", "a");
    store.recordNavigation("a:full", "https://a.test", 0);
    store.recordNavigation("a:full", "https://b.test", 1);
    store.markDetached("a:full");

    expect(
      store.planOpenReference({
        placementId: "a-again:full",
        referenceId: "a-again",
        profileId: "profile-a",
        url: "https://a.test",
      })
    ).toEqual({
      type: "reuse-history",
      journeyId: "journey-1",
      handleId: "a:full",
      placementId: "a-again:full",
      referenceId: "a-again",
      requestedUrl: "https://a.test",
      historyIndex: 0,
      requestId: "request-1",
    });
  });

  it("does not plan a history hit when no entry index was observed", () => {
    const store = new BrowsingJourneyStore(2, ids());
    addVisible(store, "a:full", "profile-a", "https://a.test", "a");
    store.recordNavigation("a:full", "https://b.test", 1);
    store.markDetached("a:full");

    expect(
      store.planOpenReference({
        placementId: "a-again:full",
        referenceId: "a-again",
        profileId: "profile-a",
        url: "https://a.test",
      })
    ).toMatchObject({ type: "create" });
  });

  it("plans and commits current-document reuse as an atomic placement transition", () => {
    const store = new BrowsingJourneyStore(2, ids());
    addVisible(store, "a:full", "profile-a", "https://same.test", "a");
    store.markDetached("a:full");

    const plan = store.planOpenReference({
      placementId: "b:full",
      referenceId: "b",
      profileId: "profile-a",
      url: "https://same.test",
    });

    expect(plan).toMatchObject({
      type: "reuse-current",
      journeyId: "journey-1",
      handleId: "a:full",
      placementId: "b:full",
      requestedUrl: "https://same.test",
    });
    if (plan.type !== "reuse-current") throw new Error("expected reuse plan");

    store.activatePlacement(plan, activation("b:full", 2));
    expect(store.getHandleIdForPlacement("b:full")).toBe("a:full");
    expect(store.getActivePlacementId("a:full")).toBe("b:full");
    expect(store.getActiveMapping("b:full")).toEqual({
      placementId: "b:full",
      journeyId: "journey-1",
      handleId: "a:full",
      routeId: "route:b:full",
      transitionGeneration: 2,
    });
    expect(store.getLiveReferenceIds()).toEqual(["a", "b"]);

    store.markDetached("a:full");
    expect(store.getHandleIdForPlacement("b:full")).toBeUndefined();
    expect(store.getActiveMapping("b:full")).toBeUndefined();
  });

  it("plans creation when a matching journey is already visible", () => {
    const store = new BrowsingJourneyStore(2, ids());
    addVisible(store, "a:full", "profile-a", "https://same.test", "a");

    expect(
      store.planOpenReference({
        placementId: "b:full",
        referenceId: "b",
        profileId: "profile-a",
        url: "https://same.test",
      })
    ).toEqual({
      type: "create",
      placementId: "b:full",
      reason: "matching-journey-visible",
    });
  });

  it("reserves a detached journey before native presentation begins", () => {
    const store = new BrowsingJourneyStore(2, ids());
    addVisible(store, "handle", "profile-a", "https://same.test", "original");
    store.markDetached("handle");

    const first = store.planOpenReference({
      placementId: "first:full",
      referenceId: "first",
      profileId: "profile-a",
      url: "https://same.test",
    });
    const second = store.planOpenReference({
      placementId: "second:full",
      referenceId: "second",
      profileId: "profile-a",
      url: "https://same.test",
    });
    if (first.type !== "reuse-current") throw new Error("expected reuse plan");
    expect(second).toEqual({
      type: "create",
      placementId: "second:full",
      reason: "matching-journey-visible",
    });

    store.activatePlacement(first, activation("first:full", 2));
    expect(store.getHandleIdForPlacement("first:full")).toBe("handle");
    expect(store.getActivePlacementId("handle")).toBe("first:full");
  });

  it("filters visible candidates before ranking detached candidates", () => {
    const store = new BrowsingJourneyStore(3, ids());
    addVisible(store, "older", "profile-a", "https://same.test", "older");
    store.markDetached("older");
    addVisible(store, "newer", "profile-a", "https://same.test", "newer");

    expect(
      store.planOpenReference({
        placementId: "destination",
        referenceId: "destination",
        profileId: "profile-a",
        url: "https://same.test",
      })
    ).toMatchObject({
      type: "reuse-current",
      handleId: "older",
      placementId: "destination",
    });
  });

  it("releases only the matching reservation after failed native work", () => {
    const store = new BrowsingJourneyStore(2, ids(), () => "request-1");
    addVisible(store, "handle", "profile-a", "https://same.test");
    store.markDetached("handle");
    const plan = store.planOpenReference({
      placementId: "destination",
      referenceId: "destination",
      profileId: "profile-a",
      url: "https://same.test",
    });
    if (plan.type !== "reuse-current") throw new Error("expected reuse plan");

    expect(store.releaseReservation({ ...plan, requestId: "stale" })).toBe(false);
    expect(store.releaseReservation(plan)).toBe(true);
    expect(store.isDetached("handle")).toBe(true);
  });

  it("survives seeded randomized lifecycle interleavings", () => {
    const { firstSeed, seedCount, operationCount } = getFuzzConfig();

    for (let seed = firstSeed; seed < firstSeed + seedCount; seed += 1) {
      const random = seededIndex(seed);
      const store = new BrowsingJourneyStore(4, ids());
      const handles = Array.from({ length: 6 }, (_, index) => `handle-${index}`);
      const placements = Array.from(
        { length: 8 },
        (_, index) => `placement-${index}`
      );
      const urls = Array.from(
        { length: 4 },
        (_, index) => `https://site-${index}.test/`
      );

      try {
        for (let step = 0; step < operationCount; step += 1) {
          const handle = handles[random(handles.length)];
          const placement = placements[random(placements.length)];
          const url = urls[random(urls.length)];
          switch (random(6)) {
            case 0:
              addVisible(
                store,
                handle,
                "profile-a",
                url,
                `ref-${random(12)}`
              );
              break;
            case 1:
              store.markDetached(handle);
              break;
            case 2:
              store.markVisible(handle, activation(placement, step + 1));
              break;
            case 3:
              store.recordNavigation(handle, url, random(5));
              break;
            case 4: {
              const plan = store.planOpenReference({
                placementId: placement,
                referenceId: `ref-${random(12)}`,
                profileId: "profile-a",
                url,
              });
              if (
                plan.type === "reuse-current" ||
                plan.type === "reuse-history"
              ) {
                store.activatePlacement(
                  plan,
                  activation(plan.placementId, step + 1)
                );
              }
              break;
            }
            case 5:
              store.remove(handle);
              break;
          }

          for (const candidateHandle of handles) {
            const activePlacement = store.getActivePlacementId(candidateHandle);
            if (activePlacement !== candidateHandle) {
              expect(store.getHandleIdForPlacement(activePlacement)).toBe(
                candidateHandle
              );
            }
          }
          for (const candidatePlacement of placements) {
            const resolvedHandle =
              store.getHandleIdForPlacement(candidatePlacement);
            if (resolvedHandle !== undefined) {
              expect(store.getActivePlacementId(resolvedHandle)).toBe(
                candidatePlacement
              );
            }
          }
        }
      } catch (error) {
        throw new Error(
          `Lifecycle fuzz failed with DIGEST_FUZZ_SEED=${seed}: ${error}`
        );
      }
    }
  });

  it("reports profile-scoped occupancy and cross-profile matches", () => {
    const store = new BrowsingJourneyStore(3, ids());
    addVisible(store, "a:full", "profile-a", "https://same.test", "a");
    store.markDetached("a:full");
    addVisible(store, "b:full", "profile-b", "https://same.test", "b");

    expect(store.getDiagnostics("profile-a", "https://same.test")).toEqual({
      candidateCount: 1,
      cacheSize: 1,
      detachedCount: 1,
      hasCrossProfileMatch: true,
    });
  });

  it("normalizes syntax without dropping query or fragment state", () => {
    expect(
      normalizeJourneyUrl("HTTPS://Example.COM:443/path?q=1#fragment")
    ).toBe("https://example.com/path?q=1#fragment");
  });
});
