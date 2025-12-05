import { WebContentsView, BrowserWindow } from "electron";
import { log } from "../utils/mainLogger";
import { DEV_CONFIG } from "../config/development";
import { ViewLayerManager, ViewLayer } from "./ViewLayerManager";
import { getProfilePartition } from "../config/profiles";
import { ViewBounds } from "../types/window";
import { ViewState } from "./ViewState";

export interface ViewConfig {
  url: string;
  bounds: ViewBounds;
  profileId: string;
  partition?: string;
}

export interface ViewLifecycleCallbacks {
  /**
   * Called when view creation starts
   */
  onViewCreating?: (blockId: string) => void;

  /**
   * Called when view is created (before loading URL)
   */
  onViewCreated?: (blockId: string, view: WebContentsView) => void;

  /**
   * Called when view starts loading
   */
  onViewLoading?: (blockId: string) => void;

  /**
   * Called when view is removed
   */
  onViewRemoved?: (blockId: string) => void;

  /**
   * Called to check if state transition is allowed
   */
  canTransitionState?: (blockId: string, newState: ViewState) => boolean;

  /**
   * Called to transition state
   */
  transitionState?: (
    blockId: string,
    newState: ViewState,
    reason?: string
  ) => boolean;

  /**
   * Called to get current state
   */
  getViewState?: (blockId: string) => ViewState;

  /**
   * Called to check if URL is valid
   */
  isValidUrl?: (url: string) => boolean;

  /**
   * Called to send initialization notification to renderer
   */
  sendInitializationNotification?: (
    blockId: string,
    notification: {
      success: boolean;
      status?: string;
      error?: string;
      errorCode?: number;
      errorDescription?: string;
      url?: string;
    }
  ) => void;

  /**
   * Called to broadcast navigation state
   */
  broadcastNavigationState?: (blockId: string, url?: string) => void;

  /**
   * Called to setup event handlers for a view
   */
  setupEventHandlers?: (
    view: WebContentsView,
    blockId: string,
    config: ViewConfig
  ) => void;
}

/**
 * ViewLifecycleManager handles the creation, updating, and removal of WebContentsView instances.
 * It coordinates with ViewManager for state transitions, error tracking, and event handling.
 */
export class ViewLifecycleManager {
  private views: Map<string, WebContentsView> = new Map();

  constructor(
    private baseWindow: BrowserWindow,
    private viewLayerManager: ViewLayerManager | undefined,
    private rendererWebContents: Electron.WebContents,
    private callbacks: ViewLifecycleCallbacks = {}
  ) {}

  /**
   * Create a new WebContentsView for a block
   */
  createView(blockId: string, config: ViewConfig): WebContentsView | null {
    if (this.baseWindow.isDestroyed()) {
      log.warn(
        `ViewLifecycleManager: baseWindow is destroyed, skipping view creation for blockId: ${blockId}`
      );
      return null;
    }

    // Validate URL if callback is provided
    if (this.callbacks.isValidUrl && !this.callbacks.isValidUrl(config.url)) {
      log.debug(
        `Invalid URL for blockId: ${blockId}: ${config.url}`,
        "ViewLifecycleManager"
      );
      this.callbacks.sendInitializationNotification?.(blockId, {
        success: false,
        error: `Invalid URL: ${config.url}`,
        errorDescription: "invalid-url",
      });
      return null;
    }

    // Check if view already exists
    const existingView = this.views.get(blockId);
    if (existingView) {
      log.debug(
        `WebContentsView already exists for blockId: ${blockId}`,
        "ViewLifecycleManager"
      );
      return existingView;
    }

    // Check if WebView rendering is disabled in development
    if (DEV_CONFIG.features.disableWebViewRendering) {
      log.debug(
        `WebView rendering disabled - skipping WebContentsView creation for blockId: ${blockId}`,
        "ViewLifecycleManager"
      );
      log.debug(
        `URL: ${config.url}, Bounds: ${JSON.stringify(
          config.bounds
        )}, profile: ${config.profileId}`,
        "ViewLifecycleManager"
      );

      // Transition to LOADING state
      this.callbacks.transitionState?.(
        blockId,
        ViewState.LOADING,
        "WebView rendering disabled"
      );

      // Send created notification
      this.callbacks.sendInitializationNotification?.(blockId, {
        success: true,
        status: "created",
      });

      // Simulate a loaded state after a short delay
      setTimeout(() => {
        this.callbacks.transitionState?.(
          blockId,
          ViewState.LOADED,
          "WebView rendering disabled (simulated)"
        );
        this.callbacks.sendInitializationNotification?.(blockId, {
          success: true,
          status: "loaded",
        });
        this.callbacks.broadcastNavigationState?.(blockId, config.url);
      }, 100);

      return null; // Skip actual WebView creation
    }

    try {
      // Transition to CREATING state
      if (
        this.callbacks.canTransitionState &&
        !this.callbacks.canTransitionState(blockId, ViewState.CREATING)
      ) {
        log.debug(
          `[${blockId}] Cannot transition to CREATING state`,
          "ViewLifecycleManager"
        );
        return null;
      }

      this.callbacks.transitionState?.(
        blockId,
        ViewState.CREATING,
        "starting view creation"
      );

      this.callbacks.onViewCreating?.(blockId);

      const partition =
        config.partition || getProfilePartition(config.profileId);

      log.debug(
        `Creating new WebContentsView for blockId: ${blockId}`,
        "ViewLifecycleManager"
      );
      log.debug(
        `URL: ${config.url}, Bounds: ${JSON.stringify(
          config.bounds
        )}, profile: ${config.profileId}, partition: ${partition}`,
        "ViewLifecycleManager"
      );

      const newView = new WebContentsView({
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          webSecurity: true,
          allowRunningInsecureContent: false,
          partition,
        },
      });

      // Set bounds before loading URL
      log.debug(
        `Setting bounds for WebContentsView: ${JSON.stringify(config.bounds)}`,
        "ViewLifecycleManager"
      );
      newView.setBounds(config.bounds);

      // Add to window before loading URL
      log.debug(
        `Adding WebContentsView to window for blockId: ${blockId}`,
        "ViewLifecycleManager"
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
          "ViewLifecycleManager"
        );
      } else {
        // Fallback to direct addition
        this.baseWindow.contentView.addChildView(newView);
      }

      // Store the view
      this.views.set(blockId, newView);

      // Setup event handlers if callback is provided
      if (this.callbacks.setupEventHandlers) {
        this.callbacks.setupEventHandlers(newView, blockId, config);
      }

      // Notify that view was created
      this.callbacks.onViewCreated?.(blockId, newView);

      // Load URL last
      log.debug(
        `Loading URL for blockId: ${blockId}: ${config.url}`,
        "ViewLifecycleManager"
      );

      // Transition to LOADING state
      this.callbacks.transitionState?.(
        blockId,
        ViewState.LOADING,
        "loading URL"
      );
      this.callbacks.onViewLoading?.(blockId);

      newView.webContents.loadURL(config.url);

      // Ensure the renderer has the initial navigation state
      this.callbacks.broadcastNavigationState?.(blockId, config.url);

      // Ensure overlays stay on top after adding a new browser block
      if (this.viewLayerManager) {
        this.viewLayerManager.forceReorder();
        log.debug(
          "Forced reorder after adding browser block",
          "ViewLifecycleManager"
        );
      }

      log.debug(
        `Successfully created WebContentsView for blockId: ${blockId}`,
        "ViewLifecycleManager"
      );

      return newView;
    } catch (error) {
      log.debug(
        `Failed to create WebContentsView for blockId: ${blockId}. Error: ${error}`,
        "ViewLifecycleManager"
      );
      // Send failure notification back to renderer
      this.callbacks.sendInitializationNotification?.(blockId, {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Update the bounds of an existing view
   */
  updateBounds(blockId: string, bounds: ViewBounds): void {
    if (this.baseWindow.isDestroyed()) {
      log.warn(
        `ViewLifecycleManager: baseWindow is destroyed, skipping bounds update for blockId: ${blockId}`
      );
      return;
    }

    const view = this.views.get(blockId);
    if (!view) {
      log.debug(
        `No view found for blockId: ${blockId} to update bounds`,
        "ViewLifecycleManager"
      );
      return;
    }

    try {
      view.setBounds(bounds);
      log.debug(
        `Updated bounds for blockId: ${blockId}: ${JSON.stringify(bounds)}`,
        "ViewLifecycleManager"
      );
    } catch (error) {
      log.debug(
        `Failed to update bounds for blockId: ${blockId}. Error: ${error}`,
        "ViewLifecycleManager"
      );
    }
  }

  /**
   * Remove a view and clean up resources
   */
  removeView(blockId: string): void {
    if (this.baseWindow.isDestroyed()) {
      log.warn(
        `ViewLifecycleManager: baseWindow is destroyed, skipping view removal for blockId: ${blockId}`
      );
      return;
    }

    const view = this.views.get(blockId);
    if (!view) {
      log.debug(
        `No view found for blockId: ${blockId} to remove`,
        "ViewLifecycleManager"
      );
      return;
    }

    try {
      log.debug(
        `Removing WebContentsView for blockId: ${blockId}`,
        "ViewLifecycleManager"
      );

      if (this.viewLayerManager) {
        // Remove via layer manager
        this.viewLayerManager.removeView(`browser-block-${blockId}`);
        log.debug(
          `Browser block ${blockId} removed via ViewLayerManager`,
          "ViewLifecycleManager"
        );
      } else {
        // Remove the view from the window directly
        this.baseWindow.contentView.removeChildView(view);
      }

      // Clean up any event listeners or resources
      view.webContents.close();

      // Remove from our registry
      this.views.delete(blockId);

      // Notify that view was removed
      this.callbacks.onViewRemoved?.(blockId);

      // Transition to REMOVED state
      this.callbacks.transitionState?.(
        blockId,
        ViewState.REMOVED,
        "view removed"
      );

      log.debug(
        `Successfully removed WebContentsView for blockId: ${blockId}`,
        "ViewLifecycleManager"
      );
    } catch (error) {
      log.debug(
        `Failed to remove WebContentsView for blockId: ${blockId}. Error: ${error}`,
        "ViewLifecycleManager"
      );
    }
  }

  /**
   * Get a view by blockId
   */
  getView(blockId: string): WebContentsView | undefined {
    return this.views.get(blockId);
  }

  /**
   * Check if a view exists
   */
  hasView(blockId: string): boolean {
    return this.views.has(blockId);
  }

  /**
   * Re-add a view that was previously removed (e.g., for error recovery)
   */
  reAddView(blockId: string, view: WebContentsView, config: ViewConfig): void {
    if (this.baseWindow.isDestroyed()) {
      log.warn(
        `ViewLifecycleManager: baseWindow is destroyed, skipping view re-add for blockId: ${blockId}`
      );
      return;
    }

    try {
      log.debug(
        `[${blockId}] Re-adding WebContentsView after error (retry)`,
        "ViewLifecycleManager"
      );

      // Transition to LOADING state for retry
      this.callbacks.transitionState?.(
        blockId,
        ViewState.LOADING,
        "retrying after error"
      );

      // Re-add the view to the hierarchy
      if (this.viewLayerManager) {
        this.viewLayerManager.addView(
          `browser-block-${blockId}`,
          view,
          ViewLayer.BROWSER_BLOCKS
        );
        log.debug(
          `[${blockId}] Re-added WebContentsView via ViewLayerManager`,
          "ViewLifecycleManager"
        );
      } else {
        this.baseWindow.contentView.addChildView(view);
        log.debug(
          `[${blockId}] Re-added WebContentsView to baseWindow`,
          "ViewLifecycleManager"
        );
      }

      // Store the view
      this.views.set(blockId, view);

      // Reload the URL
      if (config.url) {
        log.debug(
          `[${blockId}] Reloading URL after retry: ${config.url}`,
          "ViewLifecycleManager"
        );
        view.webContents.loadURL(config.url);
      }
    } catch (error) {
      log.debug(
        `[${blockId}] Failed to re-add WebContentsView: ${error}`,
        "ViewLifecycleManager"
      );
    }
  }
}
