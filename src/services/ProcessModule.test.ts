import { Container } from "./Container";
import { ProcessModuleDefinition, ProcessModuleHost } from "./ProcessModule";
import { emptyShape, shape } from "./ModuleProtocol";

describe("ProcessModuleHost", () => {
  it("interprets declared services, roots, contributions, and operations", async () => {
    const container = new Container();
    container.registerInstance("core.value", { value: 42 }, { version: "1.0.0" });
    const host = new ProcessModuleHost(container);
    const module = {
      id: "sample",
      provides: [
        {
          name: "sample.service",
          definition: {
            version: "1.0.0",
            dependencies: [{ name: "core.value", version: "^1.0.0" }],
            factory: (dependencies) =>
              dependencies.get<{ value: number }>("core.value"),
          },
        },
      ],
      activates: [{ name: "sample.service", version: "^1.0.0" }],
      contributes: [
        {
          point: "commands",
          id: "sample.run",
          dependencies: [{ name: "sample.service", version: "^1.0.0" }],
          create: (dependencies) =>
            dependencies.get<{ value: number }>("sample.service").value,
        },
      ],
      operations: [
        {
          name: "value",
          request: { input: emptyShape, output: shape<number>((value) => Number(value)) },
          dependencies: [{ name: "sample.service", version: "^1.0.0" }],
          handle: (dependencies) =>
            dependencies.get<{ value: number }>("sample.service").value,
        },
      ],
    } satisfies ProcessModuleDefinition;

    host.register(module);
    await host.activate();

    expect(host.contributions.get("commands", "sample.run")).toBe(42);
    expect(
      await host.moduleIPC.invoke("sample", "value", {}, { rendererId: 1 })
    ).toBe(42);
  });

  it("rejects duplicate modules and contributions", () => {
    const host = new ProcessModuleHost(new Container());
    const module = { id: "sample" } satisfies ProcessModuleDefinition;
    host.register(module);
    let duplicateModuleError = "";
    try {
      host.register(module);
    } catch (error) {
      duplicateModuleError = (error as Error).message;
    }
    expect(duplicateModuleError).toBe("Process module already registered: sample");

    host.contributions.add("commands", "sample.run", {});
    let duplicateContributionError = "";
    try {
      host.contributions.add("commands", "sample.run", {});
    } catch (error) {
      duplicateContributionError = (error as Error).message;
    }
    expect(duplicateContributionError).toBe(
      "Contribution already registered: commands/sample.run"
    );
  });

  it("does not expose undeclared dependencies to contributions", async () => {
    const container = new Container();
    container.registerInstance("secret", 42);
    const host = new ProcessModuleHost(container);
    host.register({
      id: "sample",
      contributes: [
        {
          point: "commands",
          id: "sample.run",
          create: (dependencies) => dependencies.get("secret"),
        },
      ],
    });

    let activationError = "";
    try {
      await host.activate();
    } catch (error) {
      activationError = (error as Error).message;
    }
    expect(activationError).toBe(
      "Module declaration did not declare dependency: secret"
    );
  });
});
