import { WebContentsView, WebContents } from "electron";
import { log } from "../utils/mainLogger";

// Maintain console listeners per view/block to avoid duplicate handlers
const consoleListeners = new Map<
  string,
  (event: any, level: number, message: string) => void
>();

/**
 * Injects a script into the web view to detect scroll boundaries and forward scroll events
 */
export function injectScrollForwardingScript(
  view: WebContentsView,
  blockId: string,
  rendererWebContents: WebContents
): void {
  // Track console listeners per block to avoid duplicates on reinjection
  const listenerKey = `${view.webContents.id}-${blockId}`;
  const existingListener = consoleListeners.get(listenerKey);
  if (existingListener) {
    view.webContents.removeListener("console-message", existingListener);
  }

  const scrollForwardingScript = `
    (function() {
      // Prevent multiple injections
      if (window.__scrollForwardingInjected) {
        return;
      }
      window.__scrollForwardingInjected = true;

      let lastWheelDelta = 0;

      function isScrollable(element) {
        if (!element || element === window) return false;
        const style = window.getComputedStyle(element);
        const canScrollY = ["auto", "scroll"].includes(style.overflowY);
        return (
          canScrollY &&
          element.scrollHeight - element.clientHeight > 1 // >1 accounts for subpixel diffs
        );
      }

      function getScrollTarget(event) {
        const path = event.composedPath ? event.composedPath() : [];
        if (path.length) {
          for (const el of path) {
            if (el instanceof Element && isScrollable(el)) {
              return el;
            }
          }
        }

        // Fallback: climb the DOM from target
        let node = event.target;
        while (node && node !== document) {
          if (node instanceof Element && isScrollable(node)) {
            return node;
          }
          node = node.parentNode;
        }

        // Final fallback: document scrolling element
        return document.scrollingElement || document.documentElement;
      }

      function getScrollState(element) {
        if (!element) {
          return { isAtTop: true, isAtBottom: true };
        }

        const scrollTop = element.scrollTop;
        const scrollHeight = element.scrollHeight;
        const clientHeight = element.clientHeight;
        const threshold = 5;

        return {
          isAtTop: scrollTop <= threshold,
          isAtBottom: scrollTop + clientHeight >= scrollHeight - threshold,
        };
      }

      function handleWheel(event) {
        // Store wheel delta for direction detection
        lastWheelDelta = event.deltaY;

        const target = getScrollTarget(event);
        const { isAtTop, isAtBottom } = getScrollState(target);
        
        // If at top and scrolling up, forward scroll immediately
        if (isAtTop && lastWheelDelta < 0) {
          // Send message via console that main process will capture
          // Pass the actual deltaY so the renderer can use it for natural scrolling
          console.log('__SCROLL_FORWARD__' + JSON.stringify({
            type: 'scroll-forward',
            direction: 'up',
            blockId: '${blockId}',
            deltaY: lastWheelDelta
          }));
        }
        
        // If at bottom and scrolling down, forward scroll immediately
        if (isAtBottom && lastWheelDelta > 0) {
          // Send message via console that main process will capture
          // Pass the actual deltaY so the renderer can use it for natural scrolling
          console.log('__SCROLL_FORWARD__' + JSON.stringify({
            type: 'scroll-forward',
            direction: 'down',
            blockId: '${blockId}',
            deltaY: lastWheelDelta
          }));
        }
      }

      // Listen for wheel events
      window.addEventListener('wheel', handleWheel, { passive: true });

      // Cleanup on unload to avoid leaking listeners across navigations
      window.addEventListener('beforeunload', () => {
        window.removeEventListener('wheel', handleWheel);
      });
    })();
  `;

  try {
    view.webContents
      .executeJavaScript(scrollForwardingScript)
      .catch((error) => {
        log.debug(
          `[${blockId}] Failed to inject scroll forwarding script: ${error}`,
          "ScrollForwardingService"
        );
      });

    const consoleListener = (event: any, level: number, message: string) => {
      try {
        // Check if message is from our scroll forwarding script
        if (
          typeof message === "string" &&
          message.startsWith("__SCROLL_FORWARD__")
        ) {
          const jsonStr = message.replace("__SCROLL_FORWARD__", "");
          const parsed = JSON.parse(jsonStr);
          if (parsed.type === "scroll-forward" && parsed.blockId === blockId) {
            log.debug(
              `[${blockId}] Scroll forward event: ${parsed.direction}`,
              "ScrollForwardingService"
            );
            // Forward to renderer with the actual deltaY
            rendererWebContents.send("browser:scroll-forward", {
              blockId,
              direction: parsed.direction,
              deltaY: parsed.deltaY || 0,
            });
          }
        }
      } catch (e) {
        // Not a JSON message from our script, ignore
      }
    };

    view.webContents.on("console-message", consoleListener);
    consoleListeners.set(listenerKey, consoleListener);
  } catch (error) {
    log.debug(
      `[${blockId}] Error setting up scroll forwarding: ${error}`,
      "ScrollForwardingService"
    );
  }
}
