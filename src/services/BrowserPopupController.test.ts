import { EventEmitter } from "node:events";
import type { BrowserWindow, HandlerDetails } from "electron";
import { BrowserPopupController } from "./BrowserPopupController";

class FakePopupWindow extends EventEmitter {
  closed = 0;
  destroyed = false;

  close(): void {
    this.closed += 1;
    this.destroyed = true;
    this.emit("closed");
  }

  isDestroyed(): boolean {
    return this.destroyed;
  }
}

function request(url: string): HandlerDetails {
  return {
    url,
    disposition: "new-window",
    frameName: "oauth",
    features: "width=500,height=650",
    referrer: { url: "https://x.com/", policy: "default" },
    postBody: undefined,
  };
}

describe("BrowserPopupController", () => {
  it("allows web popups with constrained child-window preferences", () => {
    const parent = {} as BrowserWindow;
    const controller = new BrowserPopupController(parent);

    expect(controller.decide(request("https://accounts.google.com/oauth"))).toMatchObject({
      action: "allow",
      outlivesOpener: false,
      overrideBrowserWindowOptions: {
        parent,
        modal: false,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
          webSecurity: true,
          allowRunningInsecureContent: false,
        },
      },
    });
  });

  it("denies non-web popup protocols", () => {
    const controller = new BrowserPopupController({} as BrowserWindow);

    expect(controller.decide(request("javascript:alert(1)"))).toEqual({
      action: "deny",
    });
    expect(controller.decide(request("file:///tmp/secret"))).toEqual({
      action: "deny",
    });
  });

  it("closes every popup owned by an opener", () => {
    const controller = new BrowserPopupController({} as BrowserWindow);
    const first = new FakePopupWindow();
    const second = new FakePopupWindow();
    const details = {
      url: "https://accounts.google.com/",
    } as Electron.DidCreateWindowDetails;

    controller.created("opener", first as unknown as BrowserWindow, details);
    controller.created("opener", second as unknown as BrowserWindow, details);
    controller.closeForOpener("opener");
    controller.closeForOpener("opener");

    expect(first.closed).toBe(1);
    expect(second.closed).toBe(1);
  });
});
