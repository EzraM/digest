import { PlacementRegistry } from "./PlacementRegistry";

describe("PlacementRegistry", () => {
  it("creates opaque globally unique placement identities", () => {
    const ids = ["placement-a", "placement-a", "placement-b"];
    const registry = new PlacementRegistry(() => ids.shift()!);
    const first = registry.register("window-a", 1);
    const second = registry.register("window-b", 2);

    expect(first.placementId).toBe("placement-a");
    expect(second.placementId).toBe("placement-b");
  });

  it("rejects cross-window claims and retired placements", () => {
    const registry = new PlacementRegistry(() => "placement-a");
    const placement = registry.register("window-a", 1);

    let error = "";
    try {
      registry.requireOwnedActive(placement.placementId, 2);
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    }
    expect(error).toContain("Placement is not owned by renderer");

    registry.retireWindow("window-a");
    error = "";
    try {
      registry.requireOwnedActive(placement.placementId, 1);
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    }
    expect(error).toContain("Unknown or retired placement");
  });
});
