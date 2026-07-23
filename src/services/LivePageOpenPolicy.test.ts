import { decideOpenReferenceExecution, shouldRetainJourney } from "./LivePageOpenPolicy";

const diagnostics = {
  candidateCount: 0,
  cacheSize: 0,
  detachedCount: 0,
  hasCrossProfileMatch: false,
};

describe("LivePageOpenPolicy", () => {
  it("reuses an available current-document journey", () => {
    const plan = {
      type: "reuse-current" as const,
      journeyId: "journey-1",
      handleId: "handle-1",
      placementId: "placement-1",
      referenceId: "reference-1",
      requestedUrl: "https://example.test",
      requestId: "request-1",
    };
    expect(decideOpenReferenceExecution(plan, diagnostics, true)).toEqual({
      type: "reuse-current",
      plan,
    });
  });

  it("passes an available history-entry plan through for restoration", () => {
    const plan = {
      type: "reuse-history" as const,
      journeyId: "journey-1",
      handleId: "handle-1",
      placementId: "placement-1",
      referenceId: "reference-1",
      requestedUrl: "https://example.test/earlier",
      historyIndex: 2,
      requestId: "request-1",
    };
    expect(decideOpenReferenceExecution(plan, diagnostics, true)).toEqual({
      type: "reuse-current",
      plan,
    });
  });

  it("classifies unavailable and cross-profile candidates", () => {
    const reusePlan = {
      type: "reuse-current" as const,
      journeyId: "journey-1",
      handleId: "handle-1",
      placementId: "placement-1",
      referenceId: "reference-1",
      requestedUrl: "https://example.test",
      requestId: "request-1",
    };
    expect(
      decideOpenReferenceExecution(reusePlan, diagnostics, false)
    ).toEqual({
      type: "create",
      missReason: "renderer_unavailable",
      staleHandleId: "handle-1",
    });

    expect(
      decideOpenReferenceExecution(
        {
          type: "create",
          placementId: "placement-1",
          reason: "no-current-association",
        },
        { ...diagnostics, hasCrossProfileMatch: true },
        false
      )
    ).toEqual({ type: "create", missReason: "profile_mismatch" });
  });

  it("keeps retention eligibility out of the imperative shell", () => {
    expect(shouldRetainJourney("full")).toBe(true);
    expect(shouldRetainJourney("inline")).toBe(false);
    expect(shouldRetainJourney()).toBe(false);
  });
});
