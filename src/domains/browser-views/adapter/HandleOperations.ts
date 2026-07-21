import { HandleRegistry } from './HandleRegistry';
import { log } from '../../../utils/mainLogger';
import { normalizeJourneyUrl } from '../../../services/BrowsingJourneyStore';

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

  getNavigationPosition(id: string): Result<{ activeIndex: number; url: string }> {
    const view = this.handles.get(id);
    if (!view || view.webContents.isDestroyed()) {
      return { success: false, error: `No live WebContents for ${id}` };
    }
    const history = view.webContents.navigationHistory;
    const activeIndex = history.getActiveIndex();
    const entry = history.getEntryAtIndex(activeIndex);
    if (!entry) return { success: false, error: `No active history entry for ${id}` };
    return { success: true, value: { activeIndex, url: entry.url } };
  }

  /** Validate the live entry and, for a history hit, select it before attachment. */
  prepareNavigationEntry(
    id: string,
    requestedUrl: string,
    historyIndex?: number
  ): Result<{ activeIndex: number }> {
    const view = this.handles.get(id);
    if (!view || view.webContents.isDestroyed()) {
      return { success: false, error: `No live WebContents for ${id}` };
    }
    const history = view.webContents.navigationHistory;
    const index = historyIndex ?? history.getActiveIndex();
    const entry = history.getEntryAtIndex(index);
    if (
      !entry ||
      normalizeJourneyUrl(entry.url) !== normalizeJourneyUrl(requestedUrl)
    ) {
      return { success: false, error: `History entry ${index} is stale for ${id}` };
    }
    try {
      if (history.getActiveIndex() !== index) history.goToIndex(index);
      return { success: true, value: { activeIndex: index } };
    } catch (error) {
      return {
        success: false,
        error: `Failed to select history entry ${index} for ${id}: ${error}`,
      };
    }
  }

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

    const { navigationHistory } = webContents;
    if (!navigationHistory.canGoBack()) {
      log.debug(`No history to go back for ${id}`, 'HandleOperations');
      return { success: false, error: 'No history to go back' };
    }

    log.debug(`Navigating back for ${id}`, 'HandleOperations');
    navigationHistory.goBack();

    // Return updated canGoBack state after navigation
    return {
      success: true,
      value: { canGoBack: navigationHistory.canGoBack() },
    };
  }
}
