import { useEffect } from "react";
import { log } from "../utils/rendererLogger";

/**
 * Custom hook to handle scroll forwarding from embedded web views.
 * When a web view is scrolled to the top/bottom and the user continues scrolling,
 * the scroll is forwarded to the main renderer container.
 *
 * Uses synthetic WheelEvent to maintain natural scroll feel and respect browser settings.
 */
export const useBrowserScrollForward = () => {
  useEffect(() => {
    if (!window.electronAPI?.onBrowserScrollForward) {
      return;
    }

    const unsubscribe = window.electronAPI.onBrowserScrollForward(
      (data: { blockId: string; direction: "up" | "down"; deltaY: number }) => {
        log.debug(
          `Received scroll forward event: ${data.direction} (deltaY: ${data.deltaY}) for block ${data.blockId}`,
          "useBrowserScrollForward"
        );

        // Ensure we have a valid deltaY
        const deltaY = data.deltaY || 0;
        if (deltaY === 0) {
          log.debug(
            "Skipping scroll forward - deltaY is 0",
            "useBrowserScrollForward"
          );
          return;
        }

        // Use window.scrollBy with the actual deltaY
        // This uses the exact scroll amount from the original gesture, maintaining natural feel
        // Note: We use instant scrolling (no behavior option) to match the immediate nature
        // of the forwarded scroll, but the magnitude matches the original gesture
        window.scrollBy({
          top: deltaY,
          left: 0,
        });
      }
    );

    return unsubscribe;
  }, []);
};
