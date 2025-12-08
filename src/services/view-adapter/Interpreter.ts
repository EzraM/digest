import { WebContentsView, BrowserWindow } from "electron";
import { Command } from "../view-core/commands";
import { ViewWorld, Rect } from "../view-core/types";
import { HandleRegistry } from "./HandleRegistry";
import { ViewLayerManager, ViewLayer } from "../ViewLayerManager";
import { getProfilePartition } from "../../config/profiles";
import { injectScrollForwardingScript } from "../ScrollForwardingService";
import { log } from "../../utils/mainLogger";
import { DEV_CONFIG } from "../../config/development";

/**
 * Interprets commands by producing Electron side effects.
 *
 * Key insight: The interpreter looks at the command AND the resulting world
 * to determine what side effects are needed.
 */
export class Interpreter {
  constructor(
    private baseWindow: BrowserWindow,
    private layerManager: ViewLayerManager | undefined,
    private handles: HandleRegistry,
    private rendererWebContents: Electron.WebContents,
    private onViewCreated: (id: string, view: WebContentsView) => void
  ) {}

  /**
   * Execute side effects for a command.
   * Called AFTER the reducer has produced the new world.
   */
  interpret(cmd: Command, prevWorld: ViewWorld, nextWorld: ViewWorld): void {
    switch (cmd.type) {
      case "create":
        this.createView(cmd.id, cmd.url, cmd.bounds, cmd.profile, cmd.layout);
        break;

      case "updateBounds":
        this.updateBounds(cmd.id, cmd.bounds);
        break;

      case "remove":
        this.removeView(cmd.id);
        break;

      case "retry":
        this.reloadView(cmd.id);
        break;

      case "markError":
        this.hideView(cmd.id);
        break;

      // markLoading, markReady, updateUrl don't need side effects
      // (notifications handled separately by NotificationLayer)
    }
  }

  private createView(
    id: string,
    url: string,
    bounds: Rect,
    profile: string,
    layout?: "inline" | "full"
  ): void {
    if (this.baseWindow.isDestroyed()) {
      log.warn(
        `Interpreter: baseWindow is destroyed, skipping view creation for blockId: ${id}`,
        "Interpreter"
      );
      return;
    }

    // Check if view already exists
    if (this.handles.has(id)) {
      log.debug(
        `WebContentsView already exists for blockId: ${id}`,
        "Interpreter"
      );
      return;
    }

    // Check if WebView rendering is disabled in development
    if (DEV_CONFIG.features.disableWebViewRendering) {
      log.debug(
        `WebView rendering disabled - skipping WebContentsView creation for blockId: ${id}`,
        "Interpreter"
      );
      return;
    }

    try {
      const partition = getProfilePartition(profile);

      log.debug(
        `Creating new WebContentsView for blockId: ${id}`,
        "Interpreter"
      );
      log.debug(
        `URL: ${url}, Bounds: ${JSON.stringify(bounds)}, profile: ${profile}, partition: ${partition}`,
        "Interpreter"
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
      newView.setBounds(bounds);

      // Add to window before loading URL
      if (this.layerManager) {
        this.layerManager.addView(
          `browser-block-${id}`,
          newView,
          ViewLayer.BROWSER_BLOCKS
        );
        log.debug(
          `Browser block ${id} added via ViewLayerManager`,
          "Interpreter"
        );
      } else {
        this.baseWindow.contentView.addChildView(newView);
      }

      // Store the view
      this.handles.set(id, newView);

      // Notify that view was created (this will attach event listeners)
      this.onViewCreated(id, newView);

      // Inject scroll forwarding script only for inline layout
      injectScrollForwardingScript(
        newView,
        id,
        this.rendererWebContents,
        layout ?? "inline"
      );

      // Load URL
      log.debug(`Loading URL for blockId: ${id}: ${url}`, "Interpreter");
      newView.webContents.loadURL(url);

      // Ensure overlays stay on top after adding a new browser block
      if (this.layerManager) {
        this.layerManager.forceReorder();
      }

      // Open DevTools if configured
      if (DEV_CONFIG.devtools.openBrowserViews) {
        newView.webContents.openDevTools({ mode: "detach" });
      }

      log.debug(
        `Successfully created WebContentsView for blockId: ${id}`,
        "Interpreter"
      );
    } catch (error) {
      log.debug(
        `Failed to create WebContentsView for blockId: ${id}. Error: ${error}`,
        "Interpreter"
      );
    }
  }

  private updateBounds(id: string, bounds: Rect): void {
    if (this.baseWindow.isDestroyed()) {
      log.warn(
        `Interpreter: baseWindow is destroyed, skipping bounds update for blockId: ${id}`,
        "Interpreter"
      );
      return;
    }

    const view = this.handles.get(id);
    if (!view) {
      log.debug(
        `No view found for blockId: ${id} to update bounds`,
        "Interpreter"
      );
      return;
    }

    try {
      view.setBounds(bounds);
      log.debug(
        `Updated bounds for blockId: ${id}: ${JSON.stringify(bounds)}`,
        "Interpreter"
      );
    } catch (error) {
      log.debug(
        `Failed to update bounds for blockId: ${id}. Error: ${error}`,
        "Interpreter"
      );
    }
  }

  private removeView(id: string): void {
    if (this.baseWindow.isDestroyed()) {
      log.warn(
        `Interpreter: baseWindow is destroyed, skipping view removal for blockId: ${id}`,
        "Interpreter"
      );
      return;
    }

    const view = this.handles.get(id);
    if (!view) {
      log.debug(`No view found for blockId: ${id} to remove`, "Interpreter");
      return;
    }

    try {
      log.debug(`Removing WebContentsView for blockId: ${id}`, "Interpreter");

      if (this.layerManager) {
        this.layerManager.removeView(`browser-block-${id}`);
        log.debug(
          `Browser block ${id} removed via ViewLayerManager`,
          "Interpreter"
        );
      } else {
        this.baseWindow.contentView.removeChildView(view);
      }

      // Clean up any event listeners or resources
      view.webContents.close();

      // Remove from our registry
      this.handles.delete(id);

      log.debug(
        `Successfully removed WebContentsView for blockId: ${id}`,
        "Interpreter"
      );
    } catch (error) {
      log.debug(
        `Failed to remove WebContentsView for blockId: ${id}. Error: ${error}`,
        "Interpreter"
      );
    }
  }

  private hideView(id: string): void {
    if (this.baseWindow.isDestroyed()) {
      log.warn(
        `Interpreter: baseWindow is destroyed, skipping view hide for blockId: ${id}`,
        "Interpreter"
      );
      return;
    }

    const view = this.handles.get(id);
    if (!view) {
      log.debug(`No view found for blockId: ${id} to hide`, "Interpreter");
      return;
    }

    try {
      log.debug(
        `Hiding WebContentsView for blockId: ${id} (error state)`,
        "Interpreter"
      );

      // Remove from display but keep handle for potential retry
      if (this.layerManager) {
        this.layerManager.removeView(`browser-block-${id}`);
      } else {
        this.baseWindow.contentView.removeChildView(view);
      }

      log.debug(
        `Successfully hid WebContentsView for blockId: ${id}`,
        "Interpreter"
      );
    } catch (error) {
      log.debug(
        `Failed to hide WebContentsView for blockId: ${id}. Error: ${error}`,
        "Interpreter"
      );
    }
  }

  private reloadView(id: string): void {
    if (this.baseWindow.isDestroyed()) {
      log.warn(
        `Interpreter: baseWindow is destroyed, skipping view reload for blockId: ${id}`,
        "Interpreter"
      );
      return;
    }

    const view = this.handles.get(id);
    if (!view) {
      log.debug(`No view found for blockId: ${id} to reload`, "Interpreter");
      return;
    }

    try {
      log.debug(
        `Reloading WebContentsView for blockId: ${id} (retry)`,
        "Interpreter"
      );

      // Re-add to display if it was hidden
      if (this.layerManager) {
        // Check if it's not already in the layer manager
        this.layerManager.addView(
          `browser-block-${id}`,
          view,
          ViewLayer.BROWSER_BLOCKS
        );
        this.layerManager.forceReorder();
      }

      // Reload the page
      view.webContents.reload();

      log.debug(
        `Successfully reloaded WebContentsView for blockId: ${id}`,
        "Interpreter"
      );
    } catch (error) {
      log.debug(
        `Failed to reload WebContentsView for blockId: ${id}. Error: ${error}`,
        "Interpreter"
      );
    }
  }
}
