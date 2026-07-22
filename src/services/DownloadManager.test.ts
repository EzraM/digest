import { EventEmitter } from "node:events";
import type { WebContents } from "electron";
import { DownloadManager } from "./DownloadManager";

function webContentsFor(session: EventEmitter): WebContents {
  return { session } as unknown as WebContents;
}

describe("DownloadManager session ownership", () => {
  it("attaches one download listener for many views in the same session", () => {
    const manager = new DownloadManager();
    const session = new EventEmitter();

    for (let index = 0; index < 50; index += 1) {
      manager.attachToWebContents(webContentsFor(session));
    }

    expect(session.listenerCount("will-download")).toBe(1);
  });

  it("attaches independently to distinct profile sessions", () => {
    const manager = new DownloadManager();
    const first = new EventEmitter();
    const second = new EventEmitter();

    manager.attachToWebContents(webContentsFor(first));
    manager.attachToWebContents(webContentsFor(second));

    expect(first.listenerCount("will-download")).toBe(1);
    expect(second.listenerCount("will-download")).toBe(1);
  });
});
