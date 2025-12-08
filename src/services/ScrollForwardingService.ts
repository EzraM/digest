import { WebContentsView, WebContents } from "electron";
import { log } from "../utils/mainLogger";

// Maintain console listeners per view/block to avoid duplicate handlers
const consoleListeners = new Map<
  string,
  (event: any, level: number, message: string) => void
>();

/**
 * Injects a script into the web view to prevent internal scrolling and forward all scroll events to parent
 * Only injects for inline layout - fullscreen pages scroll normally
 */
export function injectScrollForwardingScript(
  view: WebContentsView,
  blockId: string,
  rendererWebContents: WebContents,
  layout: "inline" | "full" = "inline"
): void {
  // Only inject script for inline layout
  if (layout !== "inline") {
    return;
  }
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

      function handleWheel(event) {
        // Prevent default scrolling behavior inside inline page blocks
        event.preventDefault();
        
        // Forward ALL scroll events to parent
        // Send message via console that main process will capture
        // Pass the actual deltaY so the renderer can use it for natural scrolling
        const deltaY = event.deltaY;
        const direction = deltaY < 0 ? 'up' : 'down';
        console.log('__SCROLL_FORWARD__' + JSON.stringify({
          type: 'scroll-forward',
          direction: direction,
          blockId: '${blockId}',
          deltaY: deltaY
        }));
      }

      // Listen for wheel events with preventDefault support
      window.addEventListener('wheel', handleWheel, { passive: false });

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
