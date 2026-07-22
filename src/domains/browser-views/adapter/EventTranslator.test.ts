import { EventEmitter } from "node:events";
import type { WebContentsView } from "electron";
import { ContextMenuController } from "./ContextMenuController";
import { EventTranslator } from "./EventTranslator";

class FakeWebContents extends EventEmitter {
  navigationHistory = { canGoBack: () => false };
  private windowOpenHandler?: () => { action: "deny" };

  getURL(): string {
    return "https://example.test/";
  }
  getTitle(): string {
    return "Example";
  }
  isDestroyed(): boolean {
    return false;
  }
  setWindowOpenHandler(handler: () => { action: "deny" }): void {
    this.windowOpenHandler = handler;
  }
}

describe("EventTranslator listener ownership", () => {
  it("disposes every listener installed for a view", () => {
    const webContents = new FakeWebContents();
    const translator = new EventTranslator(new ContextMenuController());
    const dispose = translator.attach(
      "view",
      { webContents } as unknown as WebContentsView,
      () => undefined,
      "profile"
    );

    expect(webContents.eventNames().length > 0).toBe(true);
    dispose();
    expect(webContents.eventNames()).toEqual([]);
  });

  it("translates renderer loss into an explicit lifecycle command", () => {
    const webContents = new FakeWebContents();
    const commands: Array<{ type: string; id?: string }> = [];
    const translator = new EventTranslator(new ContextMenuController());
    translator.attach(
      "view",
      { webContents } as unknown as WebContentsView,
      (command) => commands.push(command),
      "profile"
    );

    webContents.emit("render-process-gone", {}, { reason: "crashed" });

    expect(commands).toEqual([
      { type: "rendererGone", id: "view", reason: "crashed" },
    ]);
  });
});
