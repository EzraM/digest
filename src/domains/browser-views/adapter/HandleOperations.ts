import { HandleRegistry } from './HandleRegistry';
import { log } from '../../../utils/mainLogger';

export type Result<T> = { success: true; value: T } | { success: false; error: string };

/**
 * Direct operations on WebContentsViews that don't affect ViewWorld state.
 *
 * These are "queries" and "effects" on the Electron handles themselves,
 * not state transitions in our model.
 *
 * Key insight: DevTools state, navigation history, etc. are NOT part of our
 * essential data model. They're implementation details of the browser view.
 */
export class HandleOperations {
  constructor(private handles: HandleRegistry) {}

  /**
   * Query the DevTools state for a view.
   * This doesn't change any state - it's a pure query.
   */
  getDevToolsState(id: string): Result<{ isOpen: boolean }> {
    const view = this.handles.get(id);
    if (!view) {
      log.debug(`No view found for ${id}`, 'HandleOperations');
      return { success: false, error: `No view for ${id}` };
    }

    const { webContents } = view;
    if (webContents.isDestroyed()) {
      log.debug(`WebContents destroyed for ${id}`, 'HandleOperations');
      return { success: false, error: `WebContents destroyed for ${id}` };
    }

    const isOpen = webContents.isDevToolsOpened();
    log.debug(`DevTools state for ${id}: ${isOpen}`, 'HandleOperations');
    return { success: true, value: { isOpen } };
  }

  /**
   * Toggle DevTools for a view.
   * This is a side effect on the view, not a state change in our model.
   */
  toggleDevTools(id: string): Result<{ isOpen: boolean }> {
    const view = this.handles.get(id);
    if (!view) {
      log.debug(`No view found for ${id}`, 'HandleOperations');
      return { success: false, error: `No view for ${id}` };
    }

    const { webContents } = view;
    if (webContents.isDestroyed()) {
      log.debug(`WebContents destroyed for ${id}`, 'HandleOperations');
      return { success: false, error: `WebContents destroyed for ${id}` };
    }

    if (webContents.isDevToolsOpened()) {
      log.debug(`Closing DevTools for ${id}`, 'HandleOperations');
      webContents.closeDevTools();
      return { success: true, value: { isOpen: false } };
    }

    log.debug(`Opening DevTools for ${id}`, 'HandleOperations');
    webContents.openDevTools({ mode: 'detach' });
    return { success: true, value: { isOpen: true } };
  }

  /**
   * Navigate back in history.
   * This is a side effect on the view - the URL change will come back as an event.
   */
  goBack(id: string): Result<{ canGoBack: boolean }> {
    const view = this.handles.get(id);
    if (!view) {
      log.debug(`No view found for ${id}`, 'HandleOperations');
      return { success: false, error: `No view for ${id}` };
    }

    const { webContents } = view;
    if (webContents.isDestroyed()) {
      log.debug(`WebContents destroyed for ${id}`, 'HandleOperations');
      return { success: false, error: `WebContents destroyed for ${id}` };
    }

    if (!webContents.canGoBack()) {
      log.debug(`No history to go back for ${id}`, 'HandleOperations');
      return { success: false, error: 'No history to go back' };
    }

    log.debug(`Navigating back for ${id}`, 'HandleOperations');
    webContents.goBack();

    // Return updated canGoBack state after navigation
    return { success: true, value: { canGoBack: webContents.canGoBack() } };
  }
}
