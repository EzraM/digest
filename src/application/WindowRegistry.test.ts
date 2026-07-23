import { WindowRegistry } from "./WindowRegistry";

const session = (windowId: string, rendererId: number) =>
  ({
    windowId,
    browserWindow: {},
    rendererView: { webContents: { id: rendererId } },
  }) as any;

describe("WindowRegistry", () => {
  it("resolves trusted window identity from the Electron sender", () => {
    const registry = new WindowRegistry();
    registry.register(session("window-a", 11));
    registry.register(session("window-b", 22));

    expect(registry.resolve({ id: 22 } as any)?.windowId).toBe("window-b");
    expect(registry.resolve({ id: 99 } as any)).toBeUndefined();
  });

  it("retires renderer mappings with their window", () => {
    const registry = new WindowRegistry();
    registry.register(session("window-a", 11));
    registry.retire("window-a");
    expect(registry.resolve({ id: 11 } as any)).toBeUndefined();
  });
});
