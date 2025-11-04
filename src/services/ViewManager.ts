import { WebContentsView, BrowserWindow } from "electron";
import { Subject } from "rxjs";
import set from "lodash/set";

import { BlockViewUpdateEvent, BlockViewState } from "../types/window";
import { log } from "../utils/mainLogger";
import { shouldOpenDevTools } from "../config/development";
import { ViewLayerManager, ViewLayer } from "./ViewLayerManager";

const EVENTS = {
  BROWSER: {
    INITIALIZED: "browser:initialized",
    NEW_BLOCK: "browser:new-block",
  },
};

export class ViewManager {
  private views: BlockViewState = {};
  private events$ = new Subject<
    BlockViewUpdateEvent | { type: "remove-view"; blockId: string }
  >();
  private onLinkClickCallback?: (url: string) => void;

  constructor(
    private baseWindow: BrowserWindow,
    private viewLayerManager?: ViewLayerManager
  ) {
    this.setupEventHandlers();
  }

  // Method to set the link click callback
  public setLinkClickCallback(callback: (url: string) => void) {
    this.onLinkClickCallback = callback;
  }

  private setupEventHandlers() {
    this.events$.subscribe((ev) => {
      const { blockId } = ev;
      log.debug(
        `Received event for blockId: ${blockId}, type: ${ev.type}`,
        "ViewManager"
      );

      if (ev.type === "update-block-view") {
        log.debug(
          `Updating block view for blockId: ${blockId}, url: ${
            ev.url
          }, bounds: ${JSON.stringify(ev.bounds)}`,
          "ViewManager"
        );
        set(this.views, [blockId, "url"], ev.url);
        set(this.views, [blockId, "bounds"], ev.bounds);
        this.handleViewCreation(blockId);
        this.handleViewUpdate(blockId, ev);
      } else if (ev.type === "remove-view") {
        log.debug(`Removing view for blockId: ${blockId}`, "ViewManager");
        this.handleViewRemoval(blockId);
      }
    });
  }

  private handleViewCreation(blockId: string) {
    if (this.baseWindow.isDestroyed()) {
      log.warn(
        `ViewManager: baseWindow is destroyed, skipping view creation for blockId: ${blockId}`
      );
      return;
    }
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

        const newView = new WebContentsView({
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: true,
            allowRunningInsecureContent: false,
            // Use a shared session partition for cookie sharing across all browser blocks
            partition: "persist:shared-browser-session",
          },
        });

        // Set up permissive CSP for browser blocks to allow external sites to load their resources
        newView.webContents.session.webRequest.onHeadersReceived(
          (details: any, callback: any) => {
            callback({
              responseHeaders: {
                ...details.responseHeaders,
                // Remove or override restrictive CSP for browser blocks
                "Content-Security-Policy": [
                  "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:; " +
                    "script-src * 'unsafe-inline' 'unsafe-eval'; " +
                    "style-src * 'unsafe-inline'; " +
                    "img-src * data: blob:; " +
                    "font-src * data:; " +
                    "connect-src *; " +
                    "media-src * blob:; " +
                    "object-src *; " +
                    "child-src * blob:; " +
                    "worker-src * blob: data:; " +
                    "frame-src *;",
                ],
              },
            });
          }
        );

        // Add comprehensive event listeners for debugging
        newView.webContents.on("did-start-loading", () => {
          log.debug(
            `WebContents started loading for blockId: ${blockId}`,
            "ViewManager"
          );
        });

        // Log console messages from the WebContents
        newView.webContents.on(
          "console-message",
          (event, level, message, line, sourceId) => {
            log.debug(
              `[${blockId}] Console ${level}: ${message} (${sourceId}:${line})`,
              "ViewManager"
            );
          }
        );

        // Log all navigation attempts
        newView.webContents.on(
          "did-start-navigation",
          (event, url, isInPlace, isMainFrame) => {
            log.debug(
              `[${blockId}] Navigation started: ${url} [inPlace: ${isInPlace}, mainFrame: ${isMainFrame}]`,
              "ViewManager"
            );
          }
        );

        // Log when DOM is ready (but resources might still be loading)
        newView.webContents.on("dom-ready", () => {
          log.debug(
            `[${blockId}] DOM ready for ${newView.webContents.getURL()}`,
            "ViewManager"
          );

          // Inject script to monitor for CSS loading issues
          newView.webContents
            .executeJavaScript(
              `
            console.log('[Digest Debug] DOM ready, checking for style issues...');
            
            // Count stylesheets
            const stylesheets = document.querySelectorAll('link[rel="stylesheet"], style');
            console.log(\`[Digest Debug] Found \${stylesheets.length} stylesheets\`);
            
            // Check for failed CSS loads
            document.querySelectorAll('link[rel="stylesheet"]').forEach((link, index) => {
              link.addEventListener('error', () => {
                console.error(\`[Digest Debug] Failed to load stylesheet \${index}: \${link.href}\`);
              });
              link.addEventListener('load', () => {
                console.log(\`[Digest Debug] Successfully loaded stylesheet \${index}: \${link.href}\`);
              });
            });
            
            // Log current computed styles on body
            const bodyStyles = window.getComputedStyle(document.body);
            console.log(\`[Digest Debug] Body background: \${bodyStyles.background || 'none'}\`);
            console.log(\`[Digest Debug] Body color: \${bodyStyles.color || 'inherit'}\`);
            console.log(\`[Digest Debug] Body font: \${bodyStyles.font || 'inherit'}\`);
          `
            )
            .catch((error) => {
              log.debug(
                `[${blockId}] Failed to inject debugging script: ${error}`,
                "ViewManager"
              );
            });
        });

        newView.webContents.on("did-finish-load", () => {
          log.debug(
            `WebContents finished loading for blockId: ${blockId}`,
            "ViewManager"
          );

          // Log additional debugging info about the loaded page
          const url = newView.webContents.getURL();
          const title = newView.webContents.getTitle();
          log.debug(
            `[${blockId}] Page loaded: "${title}" at ${url}`,
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

        // Add devtools support for each browser block if configured
        if (shouldOpenDevTools("openBrowserViews")) {
          try {
            log.debug(
              `Attaching devtools for browser block ${blockId}`,
              "ViewManager"
            );
            newView.webContents.openDevTools({ mode: "detach" });
          } catch (error) {
            log.debug(
              `Failed to attach devtools for ${blockId}: ${error}`,
              "ViewManager"
            );
          }
        }

        // Update the main page load failure handler to be more specific
        newView.webContents.on(
          "did-fail-load",
          (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
            if (isMainFrame) {
              log.debug(
                `Main frame failed to load for blockId: ${blockId}. URL: ${validatedURL}, Error: ${errorDescription} (${errorCode})`,
                "ViewManager"
              );
              this.baseWindow.webContents.send(EVENTS.BROWSER.INITIALIZED, {
                blockId,
                success: false,
                error: `Failed to load: ${errorDescription} (${errorCode})`,
              });
            } else {
              log.debug(
                `Resource failed to load for blockId: ${blockId}. URL: ${validatedURL}, Error: ${errorDescription} (${errorCode})`,
                "ViewManager"
              );
            }
          }
        );

        // Handle new window requests with disposition check
        newView.webContents.setWindowOpenHandler(({ url, disposition }) => {
          log.debug(
            `New window request in blockId: ${blockId}, URL: ${url}, disposition: ${disposition}`,
            "ViewManager"
          );

          // Only create new blocks for actual "new tab/window" scenarios
          if (
            disposition === "foreground-tab" ||
            disposition === "background-tab" ||
            disposition === "new-window"
          ) {
            log.debug(
              `Creating new block for disposition: ${disposition}`,
              "ViewManager"
            );
            this.handleLinkClick(url);
            return { action: "deny" };
          }

          // Allow default disposition to navigate in current page
          log.debug(
            `Allowing navigation in current page for disposition: ${disposition}`,
            "ViewManager"
          );
          return { action: "deny" };
        });

        // Handle regular link navigation - allow all navigation to proceed
        newView.webContents.on("will-navigate", (event, url) => {
          const currentUrl = newView.webContents.getURL();

          log.debug(
            `Navigation event in blockId: ${blockId}, from: ${
              currentUrl || "unknown"
            } to: ${url}`,
            "ViewManager"
          );

          // Allow all navigation to proceed - new blocks are only created via setWindowOpenHandler
          log.debug(
            `Allowing navigation in blockId: ${blockId}, from: ${
              currentUrl || "unknown"
            } to: ${url}`,
            "ViewManager"
          );
        });

        // Also listen for page redirects to catch server-side redirects
        newView.webContents.on(
          "did-navigate",
          (event, url, httpResponseCode, httpStatusText) => {
            log.debug(
              `Did navigate in blockId: ${blockId}, to: ${url}, status: ${httpResponseCode} ${httpStatusText}`,
              "ViewManager"
            );
          }
        );

        // Listen for click events
        newView.webContents.on("before-input-event", (event, input) => {
          if (
            input.type === "keyDown" &&
            input.key === "Enter" &&
            input.control
          ) {
            log.debug(
              `Detected Ctrl+Enter in blockId: ${blockId}`,
              "ViewManager"
            );
            // This could be used for special key combinations to force new window
          }
        });

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

        if (this.viewLayerManager) {
          // Use the layer manager for proper z-ordering
          this.viewLayerManager.addView(
            `browser-block-${blockId}`,
            newView,
            ViewLayer.BROWSER_BLOCKS
          );
          log.debug(
            `Browser block ${blockId} added via ViewLayerManager`,
            "ViewManager"
          );
        } else {
          // Fallback to direct addition
          this.baseWindow.contentView.addChildView(newView);
        }

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

        // Ensure overlays stay on top after adding a new browser block
        if (this.viewLayerManager) {
          this.viewLayerManager.forceReorder();
          log.debug("Forced reorder after adding browser block", "ViewManager");
        }

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

  private handleViewUpdate(blockId: string, ev: BlockViewUpdateEvent) {
    if (this.baseWindow.isDestroyed()) {
      log.warn(
        `ViewManager: baseWindow is destroyed, skipping view update for blockId: ${blockId}`
      );
      return;
    }
    const view = this.views[blockId];
    if (view?.contents && ev.type === "update-block-view") {
      view.contents.setBounds(ev.bounds);
    }
  }

  public getDevToolsState(blockId: string): {
    success: boolean;
    isOpen: boolean;
    error?: string;
  } {
    const view = this.views[blockId];

    if (!view?.contents) {
      const errorMessage = `No WebContentsView found for blockId: ${blockId}`;
      log.debug(errorMessage, "ViewManager");
      return { success: false, isOpen: false, error: errorMessage };
    }

    try {
      const { webContents } = view.contents;

      if (webContents.isDestroyed()) {
        const destroyedMessage = `WebContents destroyed for blockId: ${blockId}`;
        log.debug(destroyedMessage, "ViewManager");
        return { success: false, isOpen: false, error: destroyedMessage };
      }

      const isOpen = webContents.isDevToolsOpened();
      log.debug(
        `DevTools state for blockId ${blockId}: ${isOpen ? "open" : "closed"}`,
        "ViewManager"
      );

      return { success: true, isOpen };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : `Unknown error: ${error}`;
      log.debug(
        `Failed to get DevTools state for blockId ${blockId}: ${message}`,
        "ViewManager"
      );
      return { success: false, isOpen: false, error: message };
    }
  }

  public toggleDevTools(blockId: string): {
    success: boolean;
    isOpen: boolean;
    error?: string;
  } {
    const view = this.views[blockId];

    if (!view?.contents) {
      const errorMessage = `Cannot toggle DevTools, no WebContentsView for blockId: ${blockId}`;
      log.debug(errorMessage, "ViewManager");
      return { success: false, isOpen: false, error: errorMessage };
    }

    try {
      const { webContents } = view.contents;

      if (webContents.isDestroyed()) {
        const destroyedMessage = `Cannot toggle DevTools, WebContents destroyed for blockId: ${blockId}`;
        log.debug(destroyedMessage, "ViewManager");
        return { success: false, isOpen: false, error: destroyedMessage };
      }

      if (webContents.isDevToolsOpened()) {
        log.debug(
          `Closing DevTools for blockId: ${blockId}`,
          "ViewManager"
        );
        webContents.closeDevTools();
        return { success: true, isOpen: false };
      }

      log.debug(`Opening DevTools for blockId: ${blockId}`, "ViewManager");
      webContents.openDevTools({ mode: "detach" });
      return { success: true, isOpen: true };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : `Unknown error: ${error}`;
      log.debug(
        `Failed to toggle DevTools for blockId ${blockId}: ${message}`,
        "ViewManager"
      );
      return { success: false, isOpen: false, error: message };
    }
  }

  public handleBlockViewUpdate(update: {
    blockId: string;
    url: string;
    bounds: { x: number; y: number; width: number; height: number };
  }) {
    log.debug(
      `Handling unified block view update: ${JSON.stringify(update)}`,
      "ViewManager"
    );
    const event: BlockViewUpdateEvent = {
      type: "update-block-view",
      ...update,
    };
    this.events$.next(event);
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

  // Handle link clicks by creating a new browser block
  private handleLinkClick(url: string) {
    log.debug(`Handling link click to URL: ${url}`, "ViewManager");

    try {
      // Ensure the URL is valid before sending
      if (!this.isValidUrl(url)) {
        log.debug(
          `Invalid URL, cannot create browser block: ${url}`,
          "ViewManager"
        );
        return;
      }

      log.debug(
        `Sending new browser block event for URL: ${url}`,
        "ViewManager"
      );

      // Call the callback function to create a new browser block
      // This will be set by main.ts to properly target the correct WebContents
      if (this.onLinkClickCallback) {
        this.onLinkClickCallback(url);
        log.debug(`Successfully sent new browser block event`, "ViewManager");
      } else {
        log.debug(
          `No link click callback available, cannot create browser block`,
          "ViewManager"
        );
      }
    } catch (error) {
      log.debug(`Error handling link click: ${error}`, "ViewManager");
    }
  }

  private handleViewRemoval(blockId: string) {
    if (this.baseWindow.isDestroyed()) {
      log.warn(
        `ViewManager: baseWindow is destroyed, skipping view removal for blockId: ${blockId}`
      );
      return;
    }
    const view = this.views[blockId];
    if (!view) {
      log.debug(
        `No view found for blockId: ${blockId} to remove`,
        "ViewManager"
      );
      return;
    }

    if (view.contents) {
      try {
        log.debug(
          `Removing WebContentsView for blockId: ${blockId}`,
          "ViewManager"
        );

        if (this.viewLayerManager) {
          // Remove via layer manager
          this.viewLayerManager.removeView(`browser-block-${blockId}`);
          log.debug(
            `Browser block ${blockId} removed via ViewLayerManager`,
            "ViewManager"
          );
        } else {
          // Remove the view from the window directly
          this.baseWindow.contentView.removeChildView(view.contents);
        }

        // Clean up any event listeners or resources
        view.contents.webContents.close();
        // Remove the view from our state
        delete this.views[blockId];
        log.debug(
          `Successfully removed WebContentsView for blockId: ${blockId}`,
          "ViewManager"
        );
      } catch (error) {
        log.debug(
          `Failed to remove WebContentsView for blockId: ${blockId}. Error: ${error}`,
          "ViewManager"
        );
      }
    } else {
      // If there's no contents but we have the blockId in our state, clean it up
      delete this.views[blockId];
      log.debug(
        `Removed view state for blockId: ${blockId} (no WebContentsView)`,
        "ViewManager"
      );
    }
  }

  public handleRemoveView(blockId: string) {
    log.debug(`Handling view removal for blockId: ${blockId}`, "ViewManager");

    this.events$.next({
      type: "remove-view",
      blockId,
    });
  }
}
