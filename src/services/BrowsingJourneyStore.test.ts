import {
  BrowsingJourneyStore,
  normalizeJourneyUrl,
} from "./BrowsingJourneyStore";

const ids = () => {
  let next = 0;
  return () => `journey-${++next}`;
};

describe("BrowsingJourneyStore", () => {
  it("projects only current live URLs by profile without journey identity", () => {
    const store = new BrowsingJourneyStore(2, ids());
    store.addVisible("handle-1", "profile-a", "https://example.com/first");
    store.recordNavigation("handle-1", "https://example.com/current");
    store.addVisible("handle-2", "profile-b", "https://example.com/current");

    expect(store.getLiveReferences()).toEqual([
      { profileId: "profile-a", url: "https://example.com/current" },
      { profileId: "profile-b", url: "https://example.com/current" },
    ]);
  });

  it("evicts the least recently used detached journey per profile", () => {
    const store = new BrowsingJourneyStore(2, ids());
    store.addVisible("a:full", "profile-a", "https://a.test", "a");
    store.markDetached("a:full");
    store.addVisible("b:full", "profile-a", "https://b.test", "b");
    store.markDetached("b:full");

    expect(
      store.addVisible("c:full", "profile-a", "https://c.test", "c")
    ).toEqual(["a:full"]);
    expect(store.getLiveReferenceIds()).toEqual(["b", "c"]);
  });

  it("never evicts a visible journey", () => {
    const store = new BrowsingJourneyStore(1, ids());
    store.addVisible("a:full", "profile-a", "https://a.test", "a");
    expect(
      store.addVisible("b:full", "profile-a", "https://b.test", "b")
    ).toEqual([]);
    expect(store.markDetached("a:full")).toEqual(["a:full"]);
  });

  it("scopes the limit and URL resolution by profile", () => {
    const store = new BrowsingJourneyStore(1, ids());
    store.addVisible("a:full", "profile-a", "https://example.test", "a");
    store.markDetached("a:full");
    store.addVisible("b:full", "profile-b", "https://example.test", "b");

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
    store.addVisible("a:full", "profile-a", "https://a.test", "a");
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
    store.addVisible("a:full", "profile-a", "https://same.test", "a");
    store.markDetached("a:full");
    store.addVisible("b:full", "profile-a", "https://same.test", "b");

    expect(
      store.resolveCurrent("profile-a", "https://same.test")?.handleId
    ).toBe("b:full");
    store.markVisible("a:full");
    expect(
      store.resolveCurrent("profile-a", "https://same.test")?.handleId
    ).toBe("a:full");
  });

  it("does not present an older visited URL as the current document", () => {
    const store = new BrowsingJourneyStore(2, ids());
    store.addVisible("a:full", "profile-a", "https://a.test", "a");
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

  it("plans and commits current-document reuse as an atomic placement transition", () => {
    const store = new BrowsingJourneyStore(2, ids());
    store.addVisible("a:full", "profile-a", "https://same.test", "a");
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
    });
    if (plan.type !== "reuse-current") throw new Error("expected reuse plan");

    store.activatePlacement(plan);
    expect(store.resolveHandleId("b:full")).toBe("a:full");
    expect(store.getActivePlacementId("a:full")).toBe("b:full");
    expect(store.getLiveReferenceIds()).toEqual(["a", "b"]);

    store.markDetached("a:full");
    expect(store.resolveHandleId("b:full")).toBe("b:full");
  });

  it("plans creation when a matching journey is already visible", () => {
    const store = new BrowsingJourneyStore(2, ids());
    store.addVisible("a:full", "profile-a", "https://same.test", "a");

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

  it("reports profile-scoped occupancy and cross-profile matches", () => {
    const store = new BrowsingJourneyStore(3, ids());
    store.addVisible("a:full", "profile-a", "https://same.test", "a");
    store.markDetached("a:full");
    store.addVisible("b:full", "profile-b", "https://same.test", "b");

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
