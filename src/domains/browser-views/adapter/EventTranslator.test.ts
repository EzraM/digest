import { EventEmitter } from "node:events";
import type { WebContentsView } from "electron";
import { ContextMenuController } from "./ContextMenuController";
import { EventTranslator } from "./EventTranslator";
import type {
  HttpResponseMonitor,
  HttpResponseObserver,
} from "../../../services/HttpResponseMonitor";

class FakeWebContents extends EventEmitter {
  id = 42;
  session = {};
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

class FakeHttpResponseMonitor implements HttpResponseMonitor {
  observer?: HttpResponseObserver;
  disposed = false;

  observe(
    _webContents: Electron.WebContents,
    observer: HttpResponseObserver
  ): () => void {
    this.observer = observer;
    return () => {
      this.disposed = true;
    };
  }

  complete(details: Partial<Electron.OnCompletedListenerDetails>): void {
    this.observer?.({
      id: 1,
      url: "https://example.test/",
      method: "GET",
      resourceType: "mainFrame",
      referrer: "",
      timestamp: 1,
      fromCache: false,
      statusCode: 200,
      statusLine: "HTTP/1.1 200 OK",
      error: "",
      ...details,
    });
  }
}

describe("EventTranslator listener ownership", () => {
  it("disposes every listener installed for a view", () => {
    const webContents = new FakeWebContents();
    const monitor = new FakeHttpResponseMonitor();
    const translator = new EventTranslator(new ContextMenuController(), monitor);
    const dispose = translator.attach(
      "view",
      { webContents } as unknown as WebContentsView,
      () => undefined,
      "profile"
    );

    expect(webContents.eventNames().length > 0).toBe(true);
    dispose();
    expect(webContents.eventNames()).toEqual([]);
    expect(monitor.disposed).toBe(true);
  });

  it("translates renderer loss into an explicit lifecycle command", () => {
    const webContents = new FakeWebContents();
    const commands: Array<{ type: string; id?: string }> = [];
    const translator = new EventTranslator(
      new ContextMenuController(),
      new FakeHttpResponseMonitor()
    );
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

  it("translates a main-frame 5xx response into an error", () => {
    const webContents = new FakeWebContents();
    const monitor = new FakeHttpResponseMonitor();
    const commands: Array<Record<string, unknown>> = [];
    const translator = new EventTranslator(new ContextMenuController(), monitor);
    translator.attach(
      "view",
      { webContents } as unknown as WebContentsView,
      (command) => commands.push(command),
      "profile"
    );

    monitor.complete({
      statusCode: 502,
      statusLine: "HTTP/1.1 502 Bad Gateway",
    });
    webContents.emit("did-stop-loading");

    expect(commands).toEqual([
      {
        type: "markError",
        id: "view",
        code: 502,
        message: "HTTP/1.1 502 Bad Gateway",
      },
    ]);
  });

  it("does not treat subresources or stale responses as page failures", () => {
    const webContents = new FakeWebContents();
    const monitor = new FakeHttpResponseMonitor();
    const commands: Array<Record<string, unknown>> = [];
    const translator = new EventTranslator(new ContextMenuController(), monitor);
    translator.attach(
      "view",
      { webContents } as unknown as WebContentsView,
      (command) => commands.push(command),
      "profile"
    );

    monitor.complete({ resourceType: "script", statusCode: 503 });
    monitor.complete({
      url: "https://old.example.test/",
      statusCode: 502,
    });

    expect(commands).toEqual([]);
  });
});
