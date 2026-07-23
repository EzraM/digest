import { DocumentEditRegistry } from "./DocumentEditRegistry";

describe("DocumentEditRegistry", () => {
  it("transfers one document edit lease between renderers", () => {
    const registry = new DocumentEditRegistry();
    registry.acquire("doc", 1);
    expect(registry.acquire("doc", 2)).toBe(1);

    let error = "";
    try {
      registry.requireOwner("doc", 1);
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    }
    expect(error).toContain("does not own");
    registry.requireOwner("doc", 2);
  });

  it("releases ownership when a renderer closes", () => {
    const registry = new DocumentEditRegistry();
    registry.acquire("doc", 1);
    registry.releaseRenderer(1);
    let rejected = false;
    try {
      registry.requireOwner("doc", 1);
    } catch {
      rejected = true;
    }
    expect(rejected).toBe(true);
  });
});
