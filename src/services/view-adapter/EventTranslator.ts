import { WebContentsView } from 'electron';
import { Command } from '../view-core/commands';
import { log } from '../../utils/mainLogger';
import { toBlockId } from '../../utils/viewId';

type CommandDispatcher = (cmd: Command) => void;
type LinkClickCallback = (url: string, sourceId: string) => void;

/**
 * Translates Electron WebContents events into commands.
 *
 * This is the only place that knows about Electron event names.
 */
export class EventTranslator {
  private onLinkClick?: LinkClickCallback;

  setLinkClickCallback(callback: LinkClickCallback): void {
    this.onLinkClick = callback;
  }

  attach(id: string, view: WebContentsView, dispatch: CommandDispatcher): void {
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

    // Handle new window requests (link clicks that should open new blocks)
    webContents.setWindowOpenHandler(({ url, disposition }) => {
      log.debug(
        `[${id}] Window open request: ${url}, disposition: ${disposition}`,
        'EventTranslator'
      );

      // Only create new blocks for actual "new tab/window" scenarios
      if (
        disposition === 'foreground-tab' ||
        disposition === 'background-tab' ||
        disposition === 'new-window'
      ) {
        log.debug(
          `[${id}] Creating new block for disposition: ${disposition}`,
          'EventTranslator'
        );
        if (this.onLinkClick) {
          this.onLinkClick(url, toBlockId(id));
        }
        return { action: 'deny' };
      }

      // Allow default disposition to navigate in current page
      log.debug(
        `[${id}] Denying window open for disposition: ${disposition}`,
        'EventTranslator'
      );
      return { action: 'deny' };
    });

    log.debug(`[${id}] Event listeners attached`, 'EventTranslator');
  }
}
