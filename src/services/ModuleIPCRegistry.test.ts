import { ModuleIPCRegistry } from "./ModuleIPCRegistry";
import { shape } from "./ModuleProtocol";

const numberShape = shape<number>((value) => {
  if (typeof value !== "number") throw new Error("Expected a number");
  return value;
});

describe("ModuleIPCRegistry", () => {
  it("scopes handlers and published events to a platform-owned module ID", async () => {
    const registry = new ModuleIPCRegistry();
    const ipc = registry.forModule("sample");
    const events: unknown[] = [];
    registry.setPublisher((event) => {
      events.push(event);
      return true;
    });
    ipc.handle(
      "double",
      { input: numberShape, output: numberShape },
      (value, context) => value * 2 + context.rendererId
    );

    expect(await registry.invoke("sample", "double", 3, { rendererId: 1 })).toBe(7);
    ipc.publish("changed", numberShape, 7);
    expect(events).toEqual([
      {
        source: { moduleId: "sample" },
        name: "changed",
        payload: 7,
      },
    ]);
  });

  it("validates inputs and rejects duplicate handlers", async () => {
    const registry = new ModuleIPCRegistry();
    const ipc = registry.forModule("sample");
    ipc.handle("double", { input: numberShape, output: numberShape }, (value) =>
      value * 2
    );
    let duplicateFailed = false;
    try {
      ipc.handle("double", { input: numberShape, output: numberShape }, () => 0);
    } catch {
      duplicateFailed = true;
    }
    expect(duplicateFailed).toBe(true);

    let validationFailed = false;
    try {
      await registry.invoke("sample", "double", "3", { rendererId: 1 });
    } catch {
      validationFailed = true;
    }
    expect(validationFailed).toBe(true);
  });

  it("reports whether an event had a delivery target", () => {
    const registry = new ModuleIPCRegistry();
    const ipc = registry.forModule("sample");
    expect(ipc.publish("changed", numberShape, 1)).toBe(false);
    registry.setPublisher(() => true);
    expect(ipc.publish("changed", numberShape, 2)).toBe(true);
  });
});
