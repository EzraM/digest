import { WebContentsView, WebContents } from "electron";
import { log } from "../utils/mainLogger";

/**
 * Injects a script into the web view to detect scroll boundaries and forward scroll events
 */
export function injectScrollForwardingScript(
  view: WebContentsView,
  blockId: string,
  rendererWebContents: WebContents
): void {
  const scrollForwardingScript = `
    (function() {
      // Prevent multiple injections
      if (window.__scrollForwardingInjected) {
        return;
      }
      window.__scrollForwardingInjected = true;

      let isAtTop = false;
      let isAtBottom = false;
      let lastWheelDelta = 0;
      let wheelTimeout = null;
      let scrollCheckTimeout = null;

      function checkScrollPosition() {
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        const scrollHeight = document.documentElement.scrollHeight;
        const clientHeight = window.innerHeight || document.documentElement.clientHeight;
        
        const wasAtTop = isAtTop;
        const wasAtBottom = isAtBottom;
        
        // Use small threshold for better detection
        isAtTop = scrollTop <= 5;
        isAtBottom = scrollTop + clientHeight >= scrollHeight - 5;
      }

      function handleWheel(event) {
        // Store wheel delta for direction detection
        lastWheelDelta = event.deltaY;

        // Clear any pending timeout
        if (wheelTimeout) {
          clearTimeout(wheelTimeout);
        }

        // Check scroll position immediately and after a short delay
        checkScrollPosition();
        
        wheelTimeout = setTimeout(() => {
          checkScrollPosition();
          
          // If at top and scrolling up, forward scroll
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
          
          // If at bottom and scrolling down, forward scroll
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
        }, 100);
      }

      // Initial check
      checkScrollPosition();

      // Listen for scroll events to update position
      window.addEventListener('scroll', () => {
        if (scrollCheckTimeout) {
          clearTimeout(scrollCheckTimeout);
        }
        scrollCheckTimeout = setTimeout(checkScrollPosition, 50);
      }, { passive: true });
      
      // Listen for wheel events
      window.addEventListener('wheel', handleWheel, { passive: true });
      
      // Also check on resize
      window.addEventListener('resize', checkScrollPosition, { passive: true });

      // Check periodically in case content loads dynamically
      setInterval(checkScrollPosition, 1000);
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

    // Listen for console messages from the injected script
    // Use a throttling mechanism to prevent too many events
    let lastScrollForwardTime = 0;
    const SCROLL_THROTTLE_MS = 50; // Minimum time between scroll forward events

    view.webContents.on("console-message", (event, level, message) => {
      try {
        // Check if message is from our scroll forwarding script
        if (
          typeof message === "string" &&
          message.startsWith("__SCROLL_FORWARD__")
        ) {
          const now = Date.now();
          // Throttle scroll forward events
          if (now - lastScrollForwardTime < SCROLL_THROTTLE_MS) {
            return;
          }
          lastScrollForwardTime = now;

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
    });
  } catch (error) {
    log.debug(
      `[${blockId}] Error setting up scroll forwarding: ${error}`,
      "ScrollForwardingService"
    );
  }
}

