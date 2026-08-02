import { Container } from "./Container";

describe("Container", () => {
  it("resolves versioned service dependencies", async () => {
    const container = new Container();
    container.register({
      name: "provider",
      version: "1.2.0",
      create: () => ({ value: 42 }),
    });
    container.register({
      name: "consumer",
      version: "1.0.0",
      dependencies: [{ name: "provider", version: "^1.0.0" }],
      create: (dependencies) =>
        dependencies.get<{ value: number }>("provider").value,
    });

    expect(await container.resolve("consumer")).toBe(42);
  });

  it("only exposes declared dependencies to creators", async () => {
    const container = new Container();
    container.register({ name: "declared", create: () => ({ value: 1 }) });
    container.register({ name: "hidden", create: () => ({ value: 2 }) });
    container.register({
      name: "consumer",
      dependencies: [{ name: "declared" }],
      create: (dependencies) => {
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
    container.register({ name: "provider", version: "2.0.0", create: () => ({}) });
    let duplicateFailed = false;
    try {
      container.register({ name: "provider", create: () => ({}) });
    } catch {
      duplicateFailed = true;
    }
    expect(duplicateFailed).toBe(true);
    container.register({
      name: "consumer",
      dependencies: [{ name: "provider", version: "^1.0.0" }],
      create: () => ({}),
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
    container.register({
      name: "provider",
      create: () => ({}),
      dispose: () => void disposed.push("provider"),
    });
    container.register({
      name: "consumer",
      dependencies: [{ name: "provider" }],
      create: () => ({}),
      dispose: () => void disposed.push("consumer"),
    });

    await container.resolve("consumer");
    await container.dispose();
    expect(disposed).toEqual(["consumer", "provider"]);
  });
});
