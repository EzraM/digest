import { WebContentsView } from 'electron';
import { Command } from '../core/commands';
import { log } from '../../../utils/mainLogger';
import { toBlockId } from '../../../utils/viewId';

type CommandDispatcher = (cmd: Command) => void;
type LinkClickCallback = (url: string, sourceId: string) => void;
type BackgroundLinkCallback = (url: string, sourceId: string, title: string, profileId: string) => void;

/**
 * Translates Electron WebContents events into commands.
 *
 * This is the only place that knows about Electron event names.
 */
export class EventTranslator {
  private onLinkClick?: LinkClickCallback;
  private onBackgroundLinkClick?: BackgroundLinkCallback;

  setLinkClickCallback(callback: LinkClickCallback): void {
    this.onLinkClick = callback;
  }

  setBackgroundLinkClickCallback(callback: BackgroundLinkCallback): void {
    this.onBackgroundLinkClick = callback;
  }

  attach(id: string, view: WebContentsView, dispatch: CommandDispatcher, profileId: string): void {
    const { webContents } = view;

    // Track if we've seen an error for this load
    let hasErrored = false;

    webContents.on('did-start-loading', () => {
      log.debug(`[${id}] did-start-loading`, 'EventTranslator');
      hasErrored = false;
      dispatch({ type: 'markLoading', id });
    });

    webContents.on('did-start-navigation', (_event, url, isInPlace, isMainFrame) => {
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

    webContents.on('dom-ready', () => {
      log.debug(`[${id}] DOM ready for ${webContents.getURL()}`, 'EventTranslator');
    });

    webContents.on('did-finish-load', () => {
      const url = webContents.getURL();
      const title = webContents.getTitle();
      log.debug(
        `[${id}] did-finish-load: "${title}" at ${url}`,
        'EventTranslator'
      );

      // Only mark as ready if we haven't seen an error
      if (!hasErrored) {
        dispatch({
          type: 'markReady',
          id,
          canGoBack: webContents.canGoBack(),
        });
      } else {
        log.debug(
          `[${id}] Skipping markReady because hasErrored=true`,
          'EventTranslator'
        );
      }
    });

    webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
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

    webContents.on('did-navigate', (_event, url) => {
      log.debug(`[${id}] did-navigate to ${url}`, 'EventTranslator');
      dispatch({ type: 'updateUrl', id, url });
    });

    webContents.on('did-navigate-in-page', (_event, url, isMainFrame) => {
      if (isMainFrame) {
        log.debug(`[${id}] did-navigate-in-page to ${url}`, 'EventTranslator');
        dispatch({ type: 'updateUrl', id, url });
      }
    });

    // Handle redirects that happen in the main frame
    webContents.on('did-redirect-navigation', (_event, url, isInPlace, isMainFrame) => {
      if (isMainFrame) {
        log.debug(
          `[${id}] Redirect to ${url} [inPlace: ${isInPlace}, mainFrame: ${isMainFrame}]`,
          'EventTranslator'
        );
        // Only update URL for main frame redirects, don't change loading state
        dispatch({ type: 'updateUrl', id, url });
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
        // Let it navigate in current page - return deny to prevent new window
        // The default behavior will handle navigation
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
  }
}
