import { Container } from "./Container";
import { ProcessModuleHost } from "./ProcessModule";

describe("ProcessModuleHost", () => {
  it("lets a module provide roots and publish contributions", async () => {
    const container = new Container();
    container.registerInstance("core.value", { value: 42 }, { version: "1.0.0" });
    const host = new ProcessModuleHost(container);

    host.register({
      id: "sample",
      register: (module) => {
        module.provide("sample.service", {
          version: "1.0.0",
          dependencies: [{ name: "core.value", version: "^1.0.0" }],
          factory: (dependencies) => {
            const value = dependencies.get<{ value: number }>("core.value");
            module.contribute("commands", "sample.run", value.value);
            return value;
          },
        });
        module.activate("sample.service", "^1.0.0");
      },
    });

    await host.activate();

    expect(host.contributions.get("commands", "sample.run")).toBe(42);
  });

  it("rejects duplicate modules and contributions", () => {
    const host = new ProcessModuleHost(new Container());
    const module = { id: "sample", register: () => undefined };
    host.register(module);
    let duplicateModuleFailed = false;
    try {
      host.register(module);
    } catch {
      duplicateModuleFailed = true;
    }
    expect(duplicateModuleFailed).toBe(true);

    host.contributions.add("commands", "sample.run", {});
    let duplicateContributionFailed = false;
    try {
      host.contributions.add("commands", "sample.run", {});
    } catch {
      duplicateContributionFailed = true;
    }
    expect(duplicateContributionFailed).toBe(true);
  });
});
