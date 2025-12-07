import { BrowserWindow, WebContents } from 'electron';
import { ViewWorld, emptyWorld } from './view-core/types';
import { Command } from './view-core/commands';
import { reduce } from './view-core/reducer';
import { Interpreter } from './view-adapter/Interpreter';
import { NotificationLayer } from './view-adapter/NotificationLayer';
import { HandleRegistry } from './view-adapter/HandleRegistry';
import { EventTranslator } from './view-adapter/EventTranslator';
import { HandleOperations } from './view-adapter/HandleOperations';
import { ViewLayerManager } from './ViewLayerManager';
import { log } from '../utils/mainLogger';

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

  constructor(
    baseWindow: BrowserWindow,
    layerManager: ViewLayerManager | undefined,
    rendererWebContents: WebContents,
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
      },
    );

    log.debug('ViewStore initialized', 'ViewStore');
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

      log.debug(
        `[${cmd.id ?? 'unknown'}] Command dispatched: ${cmd.type}`,
        'ViewStore'
      );

      // Execute side effects
      this.interpreter.interpret(cmd, prevWorld, nextWorld);

      // Notify renderer of changes
      this.notifications.notify(cmd.id, prevWorld, nextWorld);
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
  }): void {
    const existing = this.world.get(update.blockId);

    if (!existing) {
      log.debug(
        `[${update.blockId}] Creating new view for ${update.url}`,
        'ViewStore'
      );
      this.dispatch({
        type: 'create',
        id: update.blockId,
        url: update.url,
        bounds: update.bounds,
        profile: update.profileId,
      });
    } else {
      // Check if we need to update bounds
      const boundsChanged =
        existing.bounds.x !== update.bounds.x ||
        existing.bounds.y !== update.bounds.y ||
        existing.bounds.width !== update.bounds.width ||
        existing.bounds.height !== update.bounds.height;

      if (boundsChanged) {
        log.debug(
          `[${update.blockId}] Updating bounds`,
          'ViewStore'
        );
        this.dispatch({
          type: 'updateBounds',
          id: update.blockId,
          bounds: update.bounds,
        });
      }
    }
  }

  handleRemoveView(blockId: string): void {
    log.debug(`[${blockId}] Removing view`, 'ViewStore');
    this.dispatch({ type: 'remove', id: blockId });
  }

  retryView(blockId: string): void {
    log.debug(`[${blockId}] Retrying view`, 'ViewStore');
    this.dispatch({ type: 'retry', id: blockId });
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
  getDevToolsState(blockId: string): { success: boolean; isOpen: boolean; error?: string } {
    const result = this.operations.getDevToolsState(blockId);
    if (!result.success) {
      return { success: false, isOpen: false, error: result.error };
    }
    return { success: true, isOpen: result.value.isOpen };
  }

  /**
   * Toggle DevTools for a view.
   * This is a side effect on the Electron handle, not a state change.
   */
  toggleDevTools(blockId: string): { success: boolean; isOpen: boolean; error?: string } {
    const result = this.operations.toggleDevTools(blockId);
    if (!result.success) {
      return { success: false, isOpen: false, error: result.error };
    }
    return { success: true, isOpen: result.value.isOpen };
  }

  /**
   * Navigate back in history.
   * This triggers a side effect; the URL change will come back as an event.
   */
  goBack(blockId: string): { success: boolean; canGoBack: boolean; error?: string } {
    const result = this.operations.goBack(blockId);
    if (!result.success) {
      return { success: false, canGoBack: false, error: result.error };
    }
    return { success: true, canGoBack: result.value.canGoBack };
  }

  /**
   * Set callback for link clicks that should open new blocks.
   * This is external coordination with main.ts, not a state change.
   */
  setLinkClickCallback(callback: (url: string, sourceBlockId?: string) => void): void {
    this.events.setLinkClickCallback(callback);
  }
}
