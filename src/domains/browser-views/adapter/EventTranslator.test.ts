import { EventEmitter } from "node:events";
import type {
  HandlerDetails,
  WebContentsView,
  WindowOpenHandlerResponse,
} from "electron";
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
  private windowOpenHandler?: (
    details: HandlerDetails
  ) => WindowOpenHandlerResponse;
  loadedUrls: string[] = [];

  getURL(): string {
    return "https://example.test/";
  }
  getTitle(): string {
    return "Example";
  }
  isDestroyed(): boolean {
    return false;
  }
  setWindowOpenHandler(
    handler: (details: HandlerDetails) => WindowOpenHandlerResponse
  ): void {
    this.windowOpenHandler = handler;
  }
  loadURL(url: string): Promise<void> {
    this.loadedUrls.push(url);
    return Promise.resolve();
  }
  requestWindow(
    disposition: HandlerDetails["disposition"],
    url = "https://target.example/"
  ): WindowOpenHandlerResponse {
    if (!this.windowOpenHandler) throw new Error("No window open handler");
    return this.windowOpenHandler({
      url,
      disposition,
      frameName: "",
      features: "",
      referrer: { url: "", policy: "default" },
      postBody: undefined,
    });
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

function createTranslator(
  httpResponses: HttpResponseMonitor = new FakeHttpResponseMonitor()
): EventTranslator {
  return new EventTranslator({
    contextMenus: new ContextMenuController(),
    httpResponses,
    windowOpenEvents: {
      decide: () => ({ action: "deny" }),
      created: () => undefined,
    },
  });
}

describe("EventTranslator listener ownership", () => {
  it("disposes every listener installed for a view", () => {
    const webContents = new FakeWebContents();
    const monitor = new FakeHttpResponseMonitor();
    const translator = createTranslator(monitor);
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
    const translator = createTranslator();
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
    const translator = createTranslator(monitor);
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
    const translator = createTranslator(monitor);
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

  it("delegates genuine new-window requests to popup policy", () => {
    const webContents = new FakeWebContents();
    const requests: HandlerDetails[] = [];
    const translator = new EventTranslator({
      contextMenus: new ContextMenuController(),
      httpResponses: new FakeHttpResponseMonitor(),
      windowOpenEvents: {
        decide: (details) => {
          requests.push(details);
          return { action: "allow" };
        },
        created: () => undefined,
      },
    });
    translator.attach(
      "view",
      { webContents } as unknown as WebContentsView,
      () => undefined,
      "profile"
    );

    expect(webContents.requestWindow("new-window")).toEqual({
      action: "allow",
    });
    expect(requests.length).toBe(1);
    expect(webContents.loadedUrls).toEqual([]);
  });

  it("keeps foreground-tab requests in the current browsing journey", () => {
    const webContents = new FakeWebContents();
    const translator = createTranslator();
    translator.attach(
      "view",
      { webContents } as unknown as WebContentsView,
      () => undefined,
      "profile"
    );

    expect(webContents.requestWindow("foreground-tab")).toEqual({
      action: "deny",
    });
    expect(webContents.loadedUrls).toEqual(["https://target.example/"]);
  });
});
