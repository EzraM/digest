import { Container } from "./Container";

describe("Container", () => {
  it("resolves versioned service dependencies", async () => {
    const container = new Container();
    container.registerInstance("provider", { value: 42 }, { version: "1.2.0" });
    container.register("consumer", {
      version: "1.0.0",
      dependencies: [{ name: "provider", version: "^1.0.0" }],
      factory: (dependencies) =>
        dependencies.get<{ value: number }>("provider").value,
    });

    expect(await container.resolve("consumer")).toBe(42);
  });

  it("only exposes declared dependencies to factories", async () => {
    const container = new Container();
    container.registerInstance("declared", { value: 1 });
    container.registerInstance("hidden", { value: 2 });
    container.register("consumer", {
      dependencies: ["declared"],
      factory: (dependencies) => {
        expect(dependencies.get<{ value: number }>("declared").value).toBe(1);
        return dependencies.get("hidden");
      },
    });

    let failed = false;
    try {
      await container.resolve("consumer");
    } catch (error) {
      failed = String(error).includes("did not declare dependency: hidden");
    }
    expect(failed).toBe(true);
  });

  it("rejects incompatible and duplicate providers", async () => {
    const container = new Container();
    container.registerInstance("provider", {}, { version: "2.0.0" });
    let duplicateFailed = false;
    try {
      container.registerInstance("provider", {});
    } catch {
      duplicateFailed = true;
    }
    expect(duplicateFailed).toBe(true);
    container.register("consumer", {
      dependencies: [{ name: "provider", version: "^1.0.0" }],
      factory: () => ({}),
    });
    let versionFailed = false;
    try {
      await container.resolve("consumer");
    } catch {
      versionFailed = true;
    }
    expect(versionFailed).toBe(true);
  });

  it("disposes resolved services in reverse dependency order", async () => {
    const container = new Container();
    const disposed: string[] = [];
    container.register("provider", {
      factory: () => ({}),
      dispose: () => void disposed.push("provider"),
    });
    container.register("consumer", {
      dependencies: ["provider"],
      factory: () => ({}),
      dispose: () => void disposed.push("consumer"),
    });

    await container.resolve("consumer");
    await container.dispose();
    expect(disposed).toEqual(["consumer", "provider"]);
  });
});
