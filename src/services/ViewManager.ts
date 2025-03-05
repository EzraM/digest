import { WebContentsView, BrowserWindow, ipcMain } from "electron";
import { Subject } from "rxjs";
import set from "lodash/set";
import { BlockEvent, BlockViewState } from "../types/window";
import { log } from "../utils/mainLogger";

const EVENTS = {
  BROWSER: {
    INITIALIZED: "browser:initialized",
  },
};

export class ViewManager {
  private views: BlockViewState = {};
  private events$ = new Subject<BlockEvent>();

  constructor(private baseWindow: BrowserWindow) {
    this.setupEventHandlers();
  }

  private setupEventHandlers() {
    this.events$.subscribe((ev) => {
      const { blockId } = ev;
      log.debug(
        `Received event for blockId: ${blockId}, type: ${ev.type}`,
        "ViewManager"
      );

      if (ev.type === "set-url") {
        log.debug(
          `Setting URL for blockId: ${blockId}, url: ${ev.url}`,
          "ViewManager"
        );
        set(this.views, [blockId, "url"], ev.url);
      }
      if (ev.type === "set-layout") {
        log.debug(
          `Setting bounds for blockId: ${blockId}, bounds: ${JSON.stringify(
            ev.bounds
          )}`,
          "ViewManager"
        );
        set(this.views, [blockId, "bounds"], ev.bounds);

        // Log the state after setting bounds
        log.debug(
          `View state after setting bounds: ${JSON.stringify(
            this.views[blockId]
          )}`,
          "ViewManager"
        );
      }

      this.handleViewCreation(blockId);
      this.handleViewUpdate(blockId, ev);
    });
  }

  private handleViewCreation(blockId: string) {
    const view = this.views[blockId];
    log.debug(`Checking view creation for blockId: ${blockId}`, "ViewManager");
    log.debug(
      `View state: URL=${view?.url}, bounds=${JSON.stringify(
        view?.bounds
      )}, hasContents=${!!view?.contents}`,
      "ViewManager"
    );

    // Validate URL
    if (view?.url && !this.isValidUrl(view.url)) {
      log.debug(
        `Invalid URL for blockId: ${blockId}: ${view.url}`,
        "ViewManager"
      );
      this.baseWindow.webContents.send(EVENTS.BROWSER.INITIALIZED, {
        blockId,
        success: false,
        error: `Invalid URL: ${view.url}`,
      });
      return;
    }

    // Check if we have both URL and bounds
    if (!view?.url) {
      log.debug(`Missing URL for blockId: ${blockId}`, "ViewManager");
      return;
    }

    if (!view?.bounds) {
      log.debug(`Missing bounds for blockId: ${blockId}`, "ViewManager");
      return;
    }

    // If we have both URL and bounds but no contents, create a new view
    if (!view.contents) {
      try {
        log.debug(
          `Creating new WebContentsView for blockId: ${blockId}`,
          "ViewManager"
        );
        log.debug(
          `URL: ${view.url}, Bounds: ${JSON.stringify(view.bounds)}`,
          "ViewManager"
        );

        const newView = new WebContentsView();

        // Add event listeners before loading URL
        newView.webContents.on("did-start-loading", () => {
          log.debug(
            `WebContents started loading for blockId: ${blockId}`,
            "ViewManager"
          );
        });

        newView.webContents.on("did-finish-load", () => {
          log.debug(
            `WebContents finished loading for blockId: ${blockId}`,
            "ViewManager"
          );
          // Send success notification when page is fully loaded
          this.baseWindow.webContents.send(EVENTS.BROWSER.INITIALIZED, {
            blockId,
            success: true,
            status: "loaded",
          });
          log.debug(
            `Sent success notification for blockId: ${blockId}`,
            "ViewManager"
          );
        });

        newView.webContents.on(
          "did-fail-load",
          (event, errorCode, errorDescription) => {
            log.debug(
              `WebContents failed to load for blockId: ${blockId}. Error: ${errorDescription} (${errorCode})`,
              "ViewManager"
            );
            this.baseWindow.webContents.send(EVENTS.BROWSER.INITIALIZED, {
              blockId,
              success: false,
              error: `Failed to load: ${errorDescription} (${errorCode})`,
            });
          }
        );

        // Set bounds before loading URL
        log.debug(
          `Setting bounds for WebContentsView: ${JSON.stringify(view.bounds)}`,
          "ViewManager"
        );
        newView.setBounds(view.bounds);

        // Add to window before loading URL
        log.debug(
          `Adding WebContentsView to window for blockId: ${blockId}`,
          "ViewManager"
        );
        this.baseWindow.contentView.addChildView(newView);

        // Load URL last
        log.debug(
          `Loading URL for blockId: ${blockId}: ${view.url}`,
          "ViewManager"
        );
        newView.webContents.loadURL(view.url);

        // Store the view
        this.views[blockId].contents = newView;

        // Send immediate notification that view was created (not yet loaded)
        this.baseWindow.webContents.send(EVENTS.BROWSER.INITIALIZED, {
          blockId,
          success: true,
          status: "created",
        });

        log.debug(
          `Successfully created WebContentsView for blockId: ${blockId}`,
          "ViewManager"
        );
      } catch (error) {
        log.debug(
          `Failed to create WebContentsView for blockId: ${blockId}. Error: ${error}`,
          "ViewManager"
        );
        // Send failure notification back to renderer
        this.baseWindow.webContents.send(EVENTS.BROWSER.INITIALIZED, {
          blockId,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    } else if (view?.contents) {
      log.debug(
        `WebContentsView already exists for blockId: ${blockId}`,
        "ViewManager"
      );
      // If view already exists, send success notification
      this.baseWindow.webContents.send(EVENTS.BROWSER.INITIALIZED, {
        blockId,
        success: true,
        status: "existing",
      });
    }
  }

  private handleViewUpdate(blockId: string, ev: BlockEvent) {
    const view = this.views[blockId];
    if (view?.contents && ev.type === "set-layout") {
      view.contents.setBounds(ev.bounds);
    }
  }

  public handleLayoutUpdate(layout: any) {
    log.debug(
      `Handling layout update: ${JSON.stringify(layout)}`,
      "ViewManager"
    );

    // Extract the bounds from the layout object
    const { blockId, x, y, width, height } = layout;

    // Create a proper bounds object
    const bounds = { x, y, width, height };

    // Create a proper layout event
    const layoutEvent = {
      type: "set-layout" as const,
      blockId,
      bounds,
    };

    log.debug(
      `Transformed layout event: ${JSON.stringify(layoutEvent)}`,
      "ViewManager"
    );

    // Send the event to the event stream
    this.events$.next(layoutEvent);
  }

  public handleUrlUpdate(url: any) {
    this.events$.next({ ...url, type: "set-url" });
  }

  // Helper method to validate URLs
  private isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch (e) {
      log.debug(`URL validation failed: ${e}`, "ViewManager");
      return false;
    }
  }
}
