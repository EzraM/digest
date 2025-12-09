import { BrowserWindow, WebContents } from "electron";
import { ViewWorld, emptyWorld } from "./view-core/types";
import { Command } from "./view-core/commands";
import { reduce } from "./view-core/reducer";
import { Interpreter } from "./view-adapter/Interpreter";
import { NotificationLayer } from "./view-adapter/NotificationLayer";
import { HandleRegistry } from "./view-adapter/HandleRegistry";
import { EventTranslator } from "./view-adapter/EventTranslator";
import { HandleOperations } from "./view-adapter/HandleOperations";
import { ViewLayerManager } from "./ViewLayerManager";
import { log } from "../utils/mainLogger";
import { VIEW_LIFECYCLE } from "../config/viewLifecycle";

/**
 * The ViewStore orchestrates the pure core with Electron adapters.
 *
 * This replaces ViewManager as the main entry point.
 */
export class ViewStore {
  private world: ViewWorld = emptyWorld;
  private handles = new HandleRegistry();
  private interpreter: Interpreter;
  private notifications: NotificationLayer;
  private events: EventTranslator;
  private operations: HandleOperations;
  private gcTimer: NodeJS.Timeout | null = null;

  constructor(
    baseWindow: BrowserWindow,
    layerManager: ViewLayerManager | undefined,
    rendererWebContents: WebContents
  ) {
    this.notifications = new NotificationLayer(rendererWebContents);
    this.events = new EventTranslator();
    this.operations = new HandleOperations(this.handles);
    this.interpreter = new Interpreter(
      baseWindow,
      layerManager,
      this.handles,
      rendererWebContents,
      (id, view) => {
        // When a view is created, attach event listeners
        this.events.attach(id, view, (cmd) => this.dispatch(cmd));
      }
    );

    log.debug("ViewStore initialized", "ViewStore");
  }

  /**
   * Dispatch a command to update the world.
   * This is the only way to change state.
   */
  dispatch(cmd: Command): void {
    const prevWorld = this.world;
    const nextWorld = reduce(this.world, cmd);

    // Only do work if state actually changed
    if (prevWorld !== nextWorld) {
      this.world = nextWorld;

      const cmdId = "id" in cmd ? cmd.id : undefined;
      log.debug(
        `[${cmdId ?? "unknown"}] Command dispatched: ${cmd.type}`,
        "ViewStore"
      );

      // Execute side effects
      this.interpreter.interpret(cmd, prevWorld, nextWorld);

      // Notify renderer of changes
      this.notifications.notify(cmdId, prevWorld, nextWorld);
    }
  }

  /**
   * Get current world state (for debugging/testing)
   */
  getWorld(): ViewWorld {
    return this.world;
  }

  // Public API methods that dispatch commands

  handleBlockViewUpdate(update: {
    blockId: string;
    url: string;
    bounds: { x: number; y: number; width: number; height: number };
    profileId: string;
    layout?: "inline" | "full";
  }): void {
    const existing = this.world.get(update.blockId);

    if (!existing) {
      log.debug(
        `[${update.blockId}] Creating new view for ${update.url}`,
        "ViewStore"
      );
      this.dispatch({
        type: "create",
        id: update.blockId,
        url: update.url,
        bounds: update.bounds,
        profile: update.profileId,
        layout: update.layout ?? "inline", // Default to 'inline' for backward compatibility
      });
      // Note: create command initializes refCount: 1, lastAccess, and gcCandidate: false
    } else {
      // Check if we need to update bounds
      const boundsChanged =
        existing.bounds.x !== update.bounds.x ||
        existing.bounds.y !== update.bounds.y ||
        existing.bounds.width !== update.bounds.width ||
        existing.bounds.height !== update.bounds.height;

      if (boundsChanged) {
        log.debug(`[${update.blockId}] Updating bounds`, "ViewStore");
        this.dispatch({
          type: "updateBounds",
          id: update.blockId,
          bounds: update.bounds,
        });
      }
    }
  }

  handleRemoveView(blockId: string): void {
    log.debug(`[${blockId}] Removing view`, "ViewStore");
    this.dispatch({ type: "remove", id: blockId });
  }

  /**
   * Acquire: component wants access to view
   * Increments refCount and clears gcCandidate if view exists.
   * If view doesn't exist, handleBlockViewUpdate will create it.
   */
  acquireView(blockId: string): void {
    const existing = this.world.get(blockId);
    if (existing) {
      log.debug(
        `[${blockId}] Acquiring view (refCount: ${existing.refCount} -> ${existing.refCount + 1})`,
        "ViewStore"
      );
      this.dispatch({ type: "acquire", id: blockId });
    } else {
      log.debug(
        `[${blockId}] Acquire called but view doesn't exist yet (will be created on update)`,
        "ViewStore"
      );
    }
    // If view doesn't exist, handleBlockViewUpdate will create it
  }

  /**
   * Release: component is done (for now)
   * Decrements refCount and schedules GC if refCount reaches 0.
   */
  releaseView(blockId: string): void {
    log.debug(`[${blockId}] Releasing view`, "ViewStore");
    this.dispatch({ type: "release", id: blockId });
    this.scheduleGC();
  }

  /**
   * Schedule garbage collection after a delay.
   * If GC is already scheduled, this is a no-op.
   */
  private scheduleGC(): void {
    if (this.gcTimer) {
      return; // Already scheduled
    }

    log.debug(`Scheduling GC in ${VIEW_LIFECYCLE.GC_DELAY_MS}ms`, "ViewStore");
    this.gcTimer = setTimeout(() => {
      this.gcTimer = null;
      log.debug("Running GC", "ViewStore");
      this.dispatch({ type: "gc" });
    }, VIEW_LIFECYCLE.GC_DELAY_MS);
  }

  retryView(blockId: string): void {
    log.debug(`[${blockId}] Retrying view`, "ViewStore");
    this.dispatch({ type: "retry", id: blockId });
  }

  /**
   * Get the HandleRegistry (for compatibility with existing code that needs WebContentsView access)
   */
  getHandleRegistry(): HandleRegistry {
    return this.handles;
  }

  // Handle operations (direct queries/effects on views, no state change)

  /**
   * Get DevTools state for a view.
   * This is a query on the Electron handle, not a state change.
   */
  getDevToolsState(blockId: string): {
    success: boolean;
    isOpen: boolean;
    error?: string;
  } {
    const result = this.operations.getDevToolsState(blockId);
    if (result.success === false) {
      return { success: false, isOpen: false, error: result.error };
    }
    return { success: true, isOpen: result.value.isOpen };
  }

  /**
   * Toggle DevTools for a view.
   * This is a side effect on the Electron handle, not a state change.
   */
  toggleDevTools(blockId: string): {
    success: boolean;
    isOpen: boolean;
    error?: string;
  } {
    const result = this.operations.toggleDevTools(blockId);
    if (result.success === false) {
      return { success: false, isOpen: false, error: result.error };
    }
    return { success: true, isOpen: result.value.isOpen };
  }

  /**
   * Navigate back in history.
   * This triggers a side effect; the URL change will come back as an event.
   */
  goBack(blockId: string): {
    success: boolean;
    canGoBack: boolean;
    error?: string;
  } {
    const result = this.operations.goBack(blockId);
    if (result.success === false) {
      return { success: false, canGoBack: false, error: result.error };
    }
    return { success: true, canGoBack: result.value.canGoBack };
  }

  /**
   * Set callback for link clicks that should open new blocks.
   * This is external coordination with main.ts, not a state change.
   */
  setLinkClickCallback(
    callback: (url: string, sourceBlockId?: string) => void
  ): void {
    this.events.setLinkClickCallback(callback);
  }

  /**
   * Set a pending scroll position to restore when the view finishes loading.
   * Called from renderer when a block mounts with an existing scrollPercent.
   */
  setScrollPercent(blockId: string, scrollPercent: number): void {
    log.debug(
      `[${blockId}] Setting scroll percent: ${scrollPercent}`,
      "ViewStore"
    );
    this.interpreter.setPendingScrollRestore(blockId, scrollPercent);
  }
}
