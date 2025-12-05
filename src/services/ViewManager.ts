import { WebContentsView, BrowserWindow } from "electron";
import { Subject } from "rxjs";
import set from "lodash/set";

import { BlockViewUpdateEvent, BlockViewState } from "../types/window";
import { log } from "../utils/mainLogger";
import { shouldOpenDevTools, DEV_CONFIG } from "../config/development";
import { ViewLayerManager, ViewLayer } from "./ViewLayerManager";
import {
  ViewState,
  isValidTransition,
  getDefaultState,
  allowsBoundsUpdate,
  allowsRetry,
} from "./ViewState";
import { injectScrollForwardingScript } from "./ScrollForwardingService";
import { getProfilePartition } from "../config/profiles";
import {
  ViewLifecycleManager,
  ViewConfig,
  ViewLifecycleCallbacks,
} from "./ViewLifecycleManager";

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
  private onLinkClickCallback?: (url: string, sourceBlockId?: string) => void;
  private rendererWebContents: Electron.WebContents;
  // Track errors per blockId to prevent success messages from overriding them
  private blockErrors: Map<
    string,
    { errorCode: number; errorDescription: string; url: string }
  > = new Map();
  // Track state for each view
  private viewStates: Map<string, ViewState> = new Map();
  private lifecycleManager: ViewLifecycleManager;

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

    // Create lifecycle manager with callbacks
    const lifecycleCallbacks: ViewLifecycleCallbacks = {
      canTransitionState: (blockId: string, newState: ViewState) => {
        const currentState = this.viewStates.get(blockId) ?? getDefaultState();
        return isValidTransition(currentState, newState);
      },
      transitionState: (blockId: string, newState: ViewState, reason?: string) => {
        return this.transitionState(blockId, newState, reason);
      },
      getViewState: (blockId: string) => {
        return this.getViewState(blockId);
      },
      isValidUrl: (url: string) => {
        return this.isValidUrl(url);
      },
      sendInitializationNotification: (blockId: string, notification) => {
        this.baseWindow.webContents.send(EVENTS.BROWSER.INITIALIZED, {
          blockId,
          ...notification,
        });
      },
      broadcastNavigationState: (blockId: string, url?: string) => {
        this.broadcastNavigationState(blockId, url);
      },
      setupEventHandlers: (view: WebContentsView, blockId: string, config: ViewConfig) => {
        this.setupViewEventHandlers(view, blockId, config);
      },
    };

    this.lifecycleManager = new ViewLifecycleManager(
      this.baseWindow,
      this.viewLayerManager,
      this.rendererWebContents,
      lifecycleCallbacks
    );

    this.setupEventHandlers();
  }

  // Method to set the link click callback
  public setLinkClickCallback(
    callback: (url: string, sourceBlockId?: string) => void
  ) {
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

  /**
   * Setup event handlers for a WebContentsView
   * This will be extracted to ViewEventHandlers in a future refactoring
   */
  private setupViewEventHandlers(
    view: WebContentsView,
    blockId: string,
    config: ViewConfig
  ): void {
    // Add comprehensive event listeners for debugging
    view.webContents.on("did-start-loading", () => {
      log.debug(
        `WebContents started loading for blockId: ${blockId}`,
        "ViewManager"
      );
    });

    // Log all navigation attempts
    view.webContents.on(
      "did-start-navigation",
      (event, url, isInPlace, isMainFrame) => {
        log.debug(
          `[${blockId}] Navigation started: ${url} [inPlace: ${isInPlace}, mainFrame: ${isMainFrame}]`,
          "ViewManager"
        );
      }
    );

    // Log when DOM is ready (but resources might still be loading)
    view.webContents.on("dom-ready", () => {
      log.debug(
        `[${blockId}] DOM ready for ${view.webContents.getURL()}`,
        "ViewManager"
      );
    });

    view.webContents.on("did-finish-load", () => {
      log.debug(
        `WebContents finished loading for blockId: ${blockId}`,
        "ViewManager"
      );

      // Log additional debugging info about the loaded page
      const url = view.webContents.getURL();
      const title = view.webContents.getTitle();
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
      this.transitionState(blockId, ViewState.LOADED, "page loaded successfully");

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

      injectScrollForwardingScript(view, blockId, this.rendererWebContents);
    });

    // Add devtools support for each browser block if configured
    if (shouldOpenDevTools("openBrowserViews")) {
      try {
        log.debug(
          `Attaching devtools for browser block ${blockId}`,
          "ViewManager"
        );
        view.webContents.openDevTools({ mode: "detach" });
      } catch (error) {
        log.debug(
          `Failed to attach devtools for ${blockId}: ${error}`,
          "ViewManager"
        );
      }
    }

    // Update the main page load failure handler to be more specific
    view.webContents.on(
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
            const viewState = this.views[blockId];
            if (viewState?.contents) {
              log.debug(
                `[${blockId}] Hiding WebContentsView due to error`,
                "ViewManager"
              );
              if (this.viewLayerManager) {
                // Remove from layer manager to hide it
                this.viewLayerManager.removeView(`browser-block-${blockId}`);
                log.debug(
                  `[${blockId}] Removed WebContentsView from ViewLayerManager`,
                  "ViewManager"
                );
              } else {
                // Fallback: remove from window directly
                this.baseWindow.contentView.removeChildView(viewState.contents);
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
    view.webContents.setWindowOpenHandler(({ url, disposition }) => {
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
        this.handleLinkClick(url, blockId);
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
    view.webContents.on("will-navigate", (event, url) => {
      const currentUrl = view.webContents.getURL();

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
    view.webContents.on(
      "did-navigate",
      (_event, url, httpResponseCode, httpStatusText) => {
        log.debug(
          `Did navigate in blockId: ${blockId}, to: ${url}, status: ${httpResponseCode} ${httpStatusText}`,
          "ViewManager"
        );
        handleNavigationUpdate(url);
      }
    );

    view.webContents.on("did-navigate-in-page", (_event, url) => {
      log.debug(
        `In-page navigation in blockId: ${blockId}, to: ${url}`,
        "ViewManager"
      );
      handleNavigationUpdate(url);
    });

    view.webContents.on("did-redirect-navigation", (_event, url) => {
      log.debug(
        `Redirect navigation in blockId: ${blockId}, to: ${url}`,
        "ViewManager"
      );
      handleNavigationUpdate(url);
    });

    view.webContents.on("did-finish-load", () => {
      log.debug(
        `Finished load for blockId: ${blockId}, current URL: ${view.webContents.getURL()}`,
        "ViewManager"
      );
      handleNavigationUpdate(view.webContents.getURL());
    });

    // Listen for click events
    view.webContents.on("before-input-event", (event, input) => {
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
        set(this.views, [blockId, "profileId"], ev.profileId);
        if (ev.partition) {
          set(this.views, [blockId, "partition"], ev.partition);
        }

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
    const view = this.views[blockId];
    log.debug(`Checking view creation for blockId: ${blockId}`, "ViewManager");
    log.debug(
      `View state: URL=${view?.url}, bounds=${JSON.stringify(
        view?.bounds
      )}, hasContents=${!!view?.contents}`,
      "ViewManager"
    );

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
      // Use lifecycle manager to create the view
      const partition = view?.partition || getProfilePartition(view.profileId);
      if (view) {
        view.partition = partition;
      }

      const config: ViewConfig = {
        url: view.url,
        bounds: view.bounds,
        profileId: view.profileId,
        partition,
      };

      const newView = this.lifecycleManager.createView(blockId, config);
      
      if (newView) {
        // Store the view in our state
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
        // Clear the error so we can retry
        this.blockErrors.delete(blockId);

        const partition = view?.partition || getProfilePartition(view.profileId);
        const config: ViewConfig = {
          url: view.url!,
          bounds: view.bounds!,
          profileId: view.profileId,
          partition,
        };

        // Use lifecycle manager to re-add the view
        this.lifecycleManager.reAddView(blockId, view.contents, config);
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
    if (ev.type === "update-block-view") {
      this.lifecycleManager.updateBounds(blockId, ev.bounds);
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
    profileId: string;
    partition?: string;
  }) {
    log.debug(
      `Handling unified block view update: ${JSON.stringify(update)}`,
      "ViewManager"
    );
    const event: BlockViewUpdateEvent = {
      type: "update-block-view",
      blockId: update.blockId,
      url: update.url,
      bounds: update.bounds,
      profileId: update.profileId,
      partition: update.partition,
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
  private handleLinkClick(url: string, sourceBlockId?: string) {
    log.debug(
      `Handling link click to URL: ${url}, sourceBlockId: ${sourceBlockId}`,
      "ViewManager"
    );

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
        `Sending new browser block event for URL: ${url}, sourceBlockId: ${sourceBlockId}`,
        "ViewManager"
      );

      // Call the callback function to create a new browser block
      // This will be set by main.ts to properly target the correct WebContents
      if (this.onLinkClickCallback) {
        this.onLinkClickCallback(url, sourceBlockId);
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
    const view = this.views[blockId];
    if (!view) {
      log.debug(
        `No view found for blockId: ${blockId} to remove`,
        "ViewManager"
      );
      return;
    }

    // Use lifecycle manager to remove the view
    this.lifecycleManager.removeView(blockId);

    // Clean up our state
    delete this.views[blockId];
    // Clean up error tracking
    this.blockErrors.delete(blockId);
  }

  public handleRemoveView(blockId: string) {
    log.debug(`Handling view removal for blockId: ${blockId}`, "ViewManager");

    this.events$.next({
      type: "remove-view",
      blockId,
    });
  }
}
