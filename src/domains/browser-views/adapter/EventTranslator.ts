import { WebContentsView } from 'electron';
import { Command } from '../core/commands';
import { log } from '../../../utils/mainLogger';
import { toBlockId } from '../../../utils/viewId';
import { ContextMenuController } from './ContextMenuController';

type CommandDispatcher = (cmd: Command) => void;
type BackgroundLinkCallback = (url: string, sourceId: string, title: string, profileId: string) => void;

/**
 * Translates Electron WebContents events into commands.
 *
 * This is the only place that knows about Electron event names.
 */
export class EventTranslator {
  private onBackgroundLinkClick?: BackgroundLinkCallback;

  constructor(private contextMenus: ContextMenuController) {}

  setBackgroundLinkClickCallback(callback: BackgroundLinkCallback): void {
    this.onBackgroundLinkClick = callback;
  }

  attach(
    id: string,
    view: WebContentsView,
    dispatch: CommandDispatcher,
    profileId: string
  ): () => void {
    const { webContents } = view;
    const listeners: Array<{
      event: string;
      listener: (...args: any[]) => void;
    }> = [];
    const listen = (event: string, listener: (...args: any[]) => void) => {
      webContents.on(event as any, listener as any);
      listeners.push({ event, listener });
    };

    // Track if we've seen an error for this load
    let hasErrored = false;
    const updateNavigation = (url: string) => {
      dispatch({
        type: 'updateNavigation',
        id,
        url,
        canGoBack: webContents.navigationHistory.canGoBack(),
      });
    };

    listen('did-start-loading', () => {
      log.debug(`[${id}] did-start-loading`, 'EventTranslator');
      dispatch({ type: 'markLoading', id });
    });

    listen('did-start-navigation', (_event, url, isInPlace, isMainFrame) => {
      log.debug(
        `[${id}] Navigation started: ${url} [inPlace: ${isInPlace}, mainFrame: ${isMainFrame}]`,
        'EventTranslator'
      );

      // Only dispatch markLoading for main frame navigations
      if (isMainFrame && !isInPlace) {
        hasErrored = false;
        dispatch({ type: 'markLoading', id });
      }
    });

    listen('dom-ready', () => {
      log.debug(`[${id}] DOM ready for ${webContents.getURL()}`, 'EventTranslator');
    });

    listen('context-menu', (_event, params) => {
      this.contextMenus.open(id, webContents, params);
    });

    listen('did-finish-load', () => {
      const url = webContents.getURL();
      const title = webContents.getTitle();
      log.debug(
        `[${id}] did-finish-load: "${title}" at ${url}`,
        'EventTranslator'
      );

      // did-finish-load is not guaranteed to pair with did-start-loading.
      // did-stop-loading below owns the terminal ready transition.
    });

    listen('did-stop-loading', () => {
      const url = webContents.getURL();
      log.debug(`[${id}] did-stop-loading at ${url}`, 'EventTranslator');

      if (!hasErrored) {
        updateNavigation(url);
        dispatch({ type: 'markReady', id });
      } else {
        log.debug(
          `[${id}] Skipping markReady because hasErrored=true`,
          'EventTranslator'
        );
      }
    });

    listen('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      // Only handle main frame errors (ignore iframe errors)
      if (!isMainFrame) {
        log.debug(
          `[${id}] Ignoring iframe error: ${errorDescription} (${errorCode}) for ${validatedURL}`,
          'EventTranslator'
        );
        return;
      }

      // Ignore aborted loads (-3) - these happen during normal navigation
      if (errorCode === -3) {
        log.debug(
          `[${id}] Ignoring aborted load (ERR_ABORTED) for ${validatedURL}`,
          'EventTranslator'
        );
        return;
      }

      log.debug(
        `[${id}] did-fail-load: ${errorDescription} (${errorCode}) for ${validatedURL}`,
        'EventTranslator'
      );

      hasErrored = true;
      dispatch({
        type: 'markError',
        id,
        code: errorCode,
        message: errorDescription,
      });
    });

    listen('did-navigate', (_event, url) => {
      log.debug(`[${id}] did-navigate to ${url}`, 'EventTranslator');
      updateNavigation(url);
    });

    listen('did-navigate-in-page', (_event, url, isMainFrame) => {
      if (isMainFrame) {
        log.debug(`[${id}] did-navigate-in-page to ${url}`, 'EventTranslator');
        updateNavigation(url);
      }
    });

    // Handle redirects that happen in the main frame
    listen('did-redirect-navigation', (_event, url, isInPlace, isMainFrame) => {
      if (isMainFrame) {
        log.debug(
          `[${id}] Redirect to ${url} [inPlace: ${isInPlace}, mainFrame: ${isMainFrame}]`,
          'EventTranslator'
        );
        // Only update URL for main frame redirects, don't change loading state
        updateNavigation(url);
      }
    });

    // Handle new window requests (link clicks that should open new blocks or insert links)
    webContents.setWindowOpenHandler(({ url, disposition }) => {
      log.debug(
        `[${id}] Window open request: ${url}, disposition: ${disposition}`,
        'EventTranslator'
      );

      // Background-tab (cmd+click) - insert inline link in notebook
      if (disposition === 'background-tab') {
        log.debug(
          `[EventTranslator] [${id}] Background link click (cmd+click) detected`,
          'EventTranslator'
        );
        log.debug(
          `[EventTranslator] [${id}] Target URL for link insertion: ${url}`,
          'EventTranslator'
        );
        if (this.onBackgroundLinkClick) {
          // Pass source page title as placeholder - the callback will fetch the target page's title
          const sourcePageTitle = webContents.getTitle() || url;
          log.debug(
            `[EventTranslator] [${id}] Calling onBackgroundLinkClick callback with profileId: ${profileId}`,
            'EventTranslator'
          );
          this.onBackgroundLinkClick(url, toBlockId(id), sourcePageTitle, profileId);
        } else {
          log.debug(
            `[EventTranslator] [${id}] No background link click callback registered`,
            'EventTranslator'
          );
        }
        return { action: 'deny' };
      }

      // Foreground-tab or new-window - navigate current page
      if (disposition === 'foreground-tab' || disposition === 'new-window') {
        log.debug(
          `[${id}] Foreground link click, navigating current page`,
          'EventTranslator'
        );
        // Prevent Electron from creating a separate window and explicitly load
        // the target in this browser view instead.
        void webContents.loadURL(url).catch((error) => {
          log.debug(
            `[${id}] Failed to navigate window-open request to ${url}: ${error}`,
            'EventTranslator'
          );
        });
        return { action: 'deny' };
      }

      // Default disposition - deny (shouldn't happen in practice)
      log.debug(
        `[${id}] Denying window open for disposition: ${disposition}`,
        'EventTranslator'
      );
      return { action: 'deny' };
    });

    log.debug(`[${id}] Event listeners attached`, 'EventTranslator');
    return () => {
      for (const { event, listener } of listeners) {
        webContents.removeListener(event as any, listener as any);
      }
      if (!webContents.isDestroyed()) {
        webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      }
      log.debug(`[${id}] Event listeners disposed`, 'EventTranslator');
    };
  }

}
