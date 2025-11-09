import { WebContentsView, BrowserWindow } from "electron";
import { Subject } from "rxjs";
import set from "lodash/set";

import { BlockViewUpdateEvent, BlockViewState } from "../types/window";
import { log } from "../utils/mainLogger";
import { shouldOpenDevTools } from "../config/development";
import { ViewLayerManager, ViewLayer } from "./ViewLayerManager";
import {
  ViewState,
  isValidTransition,
  getDefaultState,
  allowsBoundsUpdate,
  allowsRetry,
} from "./ViewState";
import { injectScrollForwardingScript } from "./ScrollForwardingService";

const EVENTS = {
  BROWSER: {
    INITIALIZED: "browser:initialized",
    NEW_BLOCK: "browser:new-block",
    NAVIGATION: "browser:navigation-state",
  },
};

export class ViewManager {
  private views: BlockViewState = {};
  private events$ = new Subject<
    BlockViewUpdateEvent | { type: "remove-view"; blockId: string }
  >();
  private onLinkClickCallback?: (url: string) => void;
  private rendererWebContents: Electron.WebContents;
  // Track errors per blockId to prevent success messages from overriding them
  private blockErrors: Map<
    string,
    { errorCode: number; errorDescription: string; url: string }
  > = new Map();
  // Track state for each view
  private viewStates: Map<string, ViewState> = new Map();

  constructor(
    private baseWindow: BrowserWindow,
    private viewLayerManager: ViewLayerManager | undefined,
    rendererWebContents: Electron.WebContents
  ) {
    this.rendererWebContents = rendererWebContents;
    log.debug(
      `ViewManager: Renderer WebContents set to ID ${rendererWebContents.id}`,
      "ViewManager"
    );
    this.setupEventHandlers();
  }

  // Method to set the link click callback
  public setLinkClickCallback(callback: (url: string) => void) {
    this.onLinkClickCallback = callback;
  }

  /**
   * Transition view to a new state (with validation)
   */
  private transitionState(
    blockId: string,
    newState: ViewState,
    reason?: string
  ): boolean {
    const currentState = this.viewStates.get(blockId) ?? getDefaultState();

    if (!isValidTransition(currentState, newState)) {
      log.debug(
        `[${blockId}] Invalid state transition: ${currentState} → ${newState}${
          reason ? ` (${reason})` : ""
        }`,
        "ViewManager"
      );
      return false;
    }

    this.viewStates.set(blockId, newState);
    log.debug(
      `[${blockId}] State transition: ${currentState} → ${newState}${
        reason ? ` (${reason})` : ""
      }`,
      "ViewManager"
    );
    return true;
  }

  /**
   * Get current state for a view
   */
  private getViewState(blockId: string): ViewState {
    return this.viewStates.get(blockId) ?? getDefaultState();
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

        // Only trigger view creation if state allows it
        // Bounds updates should not change state when in ERROR or LOADED
        const currentState = this.getViewState(blockId);
        if (allowsBoundsUpdate(currentState)) {
          // Just update bounds, don't recreate view or change state
          this.handleViewUpdate(blockId, ev);
          log.debug(
            `[${blockId}] Bounds update only (state: ${currentState})`,
            "ViewManager"
          );
        } else {
          // State allows creation/initialization
          this.handleViewCreation(blockId);
          this.handleViewUpdate(blockId, ev);
        }
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
        errorDescription: "invalid-url",
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
      // Transition to CREATING state
      if (
        !this.transitionState(
          blockId,
          ViewState.CREATING,
          "starting view creation"
        )
      ) {
        return; // Invalid transition, abort
      }

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
          (
            details: Electron.OnHeadersReceivedListenerDetails,
            callback: (response: Electron.HeadersReceivedResponse) => void
          ) => {
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

          // Check if there was a previous error for this block
          const hasError = this.blockErrors.has(blockId);
          if (hasError) {
            const errorInfo = this.blockErrors.get(blockId);
            log.debug(
              `[${blockId}] Skipping success notification - error already reported: ${errorInfo?.errorDescription} (${errorInfo?.errorCode})`,
              "ViewManager"
            );
            // Don't send success message if there was an error
            return;
          }

          // Transition to LOADED state
          this.transitionState(
            blockId,
            ViewState.LOADED,
            "page loaded successfully"
          );

          // Send success notification when page is fully loaded
          this.baseWindow.webContents.send(EVENTS.BROWSER.INITIALIZED, {
            blockId,
            success: true,
            status: "loaded",
          });
          log.debug(
            `[${blockId}] Sent success notification to renderer`,
            "ViewManager"
          );

          injectScrollForwardingScript(
            newView,
            blockId,
            this.rendererWebContents
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
              // Track the error to prevent success messages from overriding it
              this.blockErrors.set(blockId, {
                errorCode,
                errorDescription,
                url: validatedURL,
              });
              // Transition to ERROR state
              this.transitionState(
                blockId,
                ViewState.ERROR,
                `load failed: ${errorDescription}`
              );
              log.debug(
                `[${blockId}] Tracking error: ${errorDescription} (${errorCode}) for ${validatedURL}`,
                "ViewManager"
              );

              // Hide/remove the WebContentsView when there's an error
              // This ensures only the renderer's error UI is shown
              try {
                const view = this.views[blockId];
                if (view?.contents) {
                  log.debug(
                    `[${blockId}] Hiding WebContentsView due to error`,
                    "ViewManager"
                  );
                  if (this.viewLayerManager) {
                    // Remove from layer manager to hide it
                    this.viewLayerManager.removeView(
                      `browser-block-${blockId}`
                    );
                    log.debug(
                      `[${blockId}] Removed WebContentsView from ViewLayerManager`,
                      "ViewManager"
                    );
                  } else {
                    // Fallback: remove from window directly
                    this.baseWindow.contentView.removeChildView(view.contents);
                    log.debug(
                      `[${blockId}] Removed WebContentsView from baseWindow`,
                      "ViewManager"
                    );
                  }
                }
              } catch (error) {
                log.debug(
                  `[${blockId}] Failed to hide WebContentsView: ${error}`,
                  "ViewManager"
                );
              }

              this.baseWindow.webContents.send(EVENTS.BROWSER.INITIALIZED, {
                blockId,
                success: false,
                error: `Failed to load: ${errorDescription} (${errorCode})`,
                errorCode,
                errorDescription,
                url: validatedURL,
              });
              log.debug(
                `[${blockId}] Sent error notification to renderer: ${errorDescription} (${errorCode})`,
                "ViewManager"
              );
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

        const handleNavigationUpdate = (nextUrl?: string) => {
          if (nextUrl) {
            log.debug(
              `Navigation event in blockId: ${blockId}, new URL: ${nextUrl}`,
              "ViewManager"
            );
          }
          this.broadcastNavigationState(blockId, nextUrl);
        };

        // Also listen for page redirects to catch server-side redirects
        newView.webContents.on(
          "did-navigate",
          (_event, url, httpResponseCode, httpStatusText) => {
            log.debug(
              `Did navigate in blockId: ${blockId}, to: ${url}, status: ${httpResponseCode} ${httpStatusText}`,
              "ViewManager"
            );
            handleNavigationUpdate(url);
          }
        );

        newView.webContents.on("did-navigate-in-page", (_event, url) => {
          log.debug(
            `In-page navigation in blockId: ${blockId}, to: ${url}`,
            "ViewManager"
          );
          handleNavigationUpdate(url);
        });

        newView.webContents.on("did-redirect-navigation", (_event, url) => {
          log.debug(
            `Redirect navigation in blockId: ${blockId}, to: ${url}`,
            "ViewManager"
          );
          handleNavigationUpdate(url);
        });

        newView.webContents.on("did-finish-load", () => {
          log.debug(
            `Finished load for blockId: ${blockId}, current URL: ${newView.webContents.getURL()}`,
            "ViewManager"
          );
          handleNavigationUpdate(newView.webContents.getURL());
        });

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
        // Transition to LOADING state
        this.transitionState(blockId, ViewState.LOADING, "loading URL");
        newView.webContents.loadURL(view.url);

        // Ensure the renderer has the initial navigation state
        this.broadcastNavigationState(blockId, view.url);

        // Store the view
        this.views[blockId].contents = newView;

        // Only clear errors if we're creating a completely new view (not retrying after error)
        // If there's an existing error, don't clear it - let the error handler manage it
        const hadError = this.blockErrors.has(blockId);
        if (!hadError) {
          // Clear any previous errors only if we're not in an error state
          this.blockErrors.delete(blockId);
          log.debug(
            `[${blockId}] Cleared previous errors, creating new view`,
            "ViewManager"
          );
        } else {
          log.debug(
            `[${blockId}] Keeping error state, not clearing on view creation`,
            "ViewManager"
          );
        }

        // Send immediate notification that view was created (not yet loaded)
        // But don't send if we're in an error state - let the error handler send the error message
        if (!hadError) {
          this.baseWindow.webContents.send(EVENTS.BROWSER.INITIALIZED, {
            blockId,
            success: true,
            status: "created",
          });
          log.debug(
            `[${blockId}] Sent 'created' status notification to renderer`,
            "ViewManager"
          );
        } else {
          log.debug(
            `[${blockId}] Skipping 'created' notification - error state exists`,
            "ViewManager"
          );
        }

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

      // Check if the view was removed due to an error and needs to be re-added
      const needsReAdd = this.blockErrors.has(blockId);
      const currentState = this.getViewState(blockId);
      if (needsReAdd && allowsRetry(currentState)) {
        log.debug(
          `[${blockId}] Re-adding WebContentsView after error (retry)`,
          "ViewManager"
        );
        try {
          // Transition to LOADING state for retry
          this.transitionState(
            blockId,
            ViewState.LOADING,
            "retrying after error"
          );
          // Clear the error so we can retry
          this.blockErrors.delete(blockId);

          // Re-add the view to the hierarchy
          if (this.viewLayerManager) {
            this.viewLayerManager.addView(
              `browser-block-${blockId}`,
              view.contents,
              ViewLayer.BROWSER_BLOCKS
            );
            log.debug(
              `[${blockId}] Re-added WebContentsView via ViewLayerManager`,
              "ViewManager"
            );
          } else {
            this.baseWindow.contentView.addChildView(view.contents);
            log.debug(
              `[${blockId}] Re-added WebContentsView to baseWindow`,
              "ViewManager"
            );
          }

          // Reload the URL
          if (view.url) {
            log.debug(
              `[${blockId}] Reloading URL after retry: ${view.url}`,
              "ViewManager"
            );
            view.contents.webContents.loadURL(view.url);
          }
        } catch (error) {
          log.debug(
            `[${blockId}] Failed to re-add WebContentsView: ${error}`,
            "ViewManager"
          );
        }
      }

      // If view already exists, only send success notification if we're not in an error state
      // This prevents bounds updates from clearing error states
      if (!this.blockErrors.has(blockId)) {
        this.baseWindow.webContents.send(EVENTS.BROWSER.INITIALIZED, {
          blockId,
          success: true,
          status: needsReAdd ? "created" : "existing",
        });
        log.debug(
          `[${blockId}] Sent 'existing' status notification to renderer`,
          "ViewManager"
        );
      } else {
        log.debug(
          `[${blockId}] Skipping 'existing' notification - error state exists`,
          "ViewManager"
        );
      }
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

  private broadcastNavigationState(blockId: string, explicitUrl?: string) {
    if (this.baseWindow.isDestroyed()) {
      log.warn(
        `ViewManager: baseWindow is destroyed, skipping navigation broadcast for blockId: ${blockId}`
      );
      return;
    }

    if (this.rendererWebContents.isDestroyed()) {
      log.warn(
        `ViewManager: Renderer WebContents is destroyed, cannot broadcast navigation for blockId: ${blockId}`,
        "ViewManager"
      );
      return;
    }

    const view = this.views[blockId];
    if (!view?.contents) {
      log.debug(
        `No WebContentsView available to broadcast navigation for blockId: ${blockId}`,
        "ViewManager"
      );
      return;
    }

    const { webContents } = view.contents;

    if (webContents.isDestroyed()) {
      log.warn(
        `Cannot broadcast navigation, WebContents destroyed for blockId: ${blockId}`,
        "ViewManager"
      );
      return;
    }

    const currentUrl = explicitUrl || webContents.getURL();
    if (!currentUrl) {
      return;
    }

    set(this.views, [blockId, "url"], currentUrl);

    const canGoBack = webContents.canGoBack();

    const payload = {
      blockId,
      url: currentUrl,
      canGoBack,
    };

    try {
      this.rendererWebContents.send(EVENTS.BROWSER.NAVIGATION, payload);
    } catch (error) {
      log.debug(
        `Failed to send navigation update for blockId ${blockId}: ${error}`,
        "ViewManager"
      );
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
        log.debug(`Closing DevTools for blockId: ${blockId}`, "ViewManager");
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

  public goBack(blockId: string): {
    success: boolean;
    canGoBack: boolean;
    error?: string;
  } {
    const view = this.views[blockId];

    if (!view?.contents) {
      const errorMessage = `Cannot navigate back, no WebContentsView for blockId: ${blockId}`;
      log.debug(errorMessage, "ViewManager");
      return { success: false, canGoBack: false, error: errorMessage };
    }

    try {
      const { webContents } = view.contents;

      if (webContents.isDestroyed()) {
        const destroyedMessage = `Cannot navigate back, WebContents destroyed for blockId: ${blockId}`;
        log.debug(destroyedMessage, "ViewManager");
        return { success: false, canGoBack: false, error: destroyedMessage };
      }

      if (!webContents.canGoBack()) {
        log.debug(
          `No history to navigate back for blockId: ${blockId}`,
          "ViewManager"
        );
        return { success: false, canGoBack: false };
      }

      webContents.goBack();
      return { success: true, canGoBack: webContents.canGoBack() };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : `Unknown error: ${error}`;
      log.debug(
        `Failed to navigate back for blockId ${blockId}: ${message}`,
        "ViewManager"
      );
      return { success: false, canGoBack: false, error: message };
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
        // Clean up error tracking
        this.blockErrors.delete(blockId);
        // Transition to REMOVED state
        this.transitionState(blockId, ViewState.REMOVED, "view removed");
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
      // Clean up error tracking
      this.blockErrors.delete(blockId);
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
