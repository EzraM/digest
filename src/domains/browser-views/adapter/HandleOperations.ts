import { HandleRegistry } from './HandleRegistry';
import { log } from '../../../utils/mainLogger';
import { normalizeJourneyUrl } from '../../../services/BrowsingJourneyStore';
import type { NavigationEntryPreparation } from '../../../services/BrowserPresentationContracts';

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
  ): NavigationEntryPreparation {
    const view = this.handles.get(id);
    if (!view || view.webContents.isDestroyed()) {
      return { state: 'failed', error: `No live WebContents for ${id}` };
    }
    const history = view.webContents.navigationHistory;
    const index = historyIndex ?? history.getActiveIndex();
    const entry = history.getEntryAtIndex(index);
    if (
      !entry ||
      normalizeJourneyUrl(entry.url) !== normalizeJourneyUrl(requestedUrl)
    ) {
      return { state: 'failed', error: `History entry ${index} is stale for ${id}` };
    }
    if (history.getActiveIndex() === index) {
      return { state: 'ready', activeIndex: index };
    }

    const pending = this.waitForNavigationEntry(id, index, requestedUrl);
    try {
      history.goToIndex(index);
      return { state: 'pending', completion: pending.completion };
    } catch (error) {
      pending.cancel();
      return { state: 'failed', error: `Failed to select history entry ${index} for ${id}: ${error}` };
    }
  }

  private waitForNavigationEntry(
    id: string,
    targetIndex: number,
    requestedUrl: string
  ): {
    completion: Promise<Result<{ activeIndex: number }>>;
    cancel: () => void;
  } {
    const view = this.handles.get(id)!;
    const { webContents } = view;
    let cancel: () => void = () => undefined;
    const completion = new Promise<Result<{ activeIndex: number }>>((resolve) => {
      let settled = false;
      let sawTargetNavigationStart = false;
      const finish = (result: Result<{ activeIndex: number }>) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        webContents.removeListener('did-start-navigation' as any, started as any);
        webContents.removeListener('dom-ready' as any, ready as any);
        webContents.removeListener('did-navigate-in-page' as any, inPage as any);
        webContents.removeListener('did-fail-load' as any, fail as any);
        webContents.removeListener('render-process-gone' as any, gone as any);
        webContents.removeListener('destroyed' as any, destroyed as any);
        resolve(result);
      };
      const isTargetActive = () => {
        if (webContents.isDestroyed()) return destroyed();
        const history = webContents.navigationHistory;
        const activeIndex = history.getActiveIndex();
        const entry = history.getEntryAtIndex(activeIndex);
        if (
          activeIndex === targetIndex &&
          entry &&
          normalizeJourneyUrl(entry.url) === normalizeJourneyUrl(requestedUrl)
        ) {
          finish({ success: true, value: { activeIndex } });
        }
      };
      const started = (
        _event: unknown,
        url: string,
        _isInPlace: boolean,
        isMainFrame: boolean
      ) => {
        if (
          isMainFrame &&
          normalizeJourneyUrl(url) === normalizeJourneyUrl(requestedUrl)
        ) {
          sawTargetNavigationStart = true;
        }
      };
      const ready = () => {
        if (sawTargetNavigationStart) isTargetActive();
      };
      const inPage = (
        _event: unknown,
        url: string,
        isMainFrame: boolean
      ) => {
        if (
          sawTargetNavigationStart &&
          isMainFrame &&
          normalizeJourneyUrl(url) === normalizeJourneyUrl(requestedUrl)
        ) {
          isTargetActive();
        }
      };
      const fail = (_event: unknown, code: number, description: string, url: string, isMainFrame: boolean) => {
        if (isMainFrame && code !== -3) finish({ success: false, error: `History navigation failed for ${id}: ${description} (${code}) at ${url}` });
      };
      const gone = () => finish({ success: false, error: `Renderer exited while restoring history for ${id}` });
      const destroyed = () => finish({ success: false, error: `WebContents destroyed while restoring history for ${id}` });
      cancel = () => finish({ success: false, error: `History navigation did not start for ${id}` });
      webContents.on('did-start-navigation' as any, started as any);
      webContents.on('dom-ready' as any, ready as any);
      webContents.on('did-navigate-in-page' as any, inPage as any);
      webContents.on('did-fail-load' as any, fail as any);
      webContents.on('render-process-gone' as any, gone as any);
      webContents.on('destroyed' as any, destroyed as any);
      const timeout = setTimeout(
        () => finish({ success: false, error: `Timed out restoring history entry ${targetIndex} for ${id}` }),
        5000
      );
    });
    return { completion, cancel };
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
