import { useRef, useCallback } from "react";

type Bounds = { x: number; y: number; width: number; height: number };

/**
 * A custom hook to manage updating the main process with browser view information.
 * It stores the latest url and bounds in refs to avoid unnecessary re-renders
 * and sends a consolidated update only when both are available.
 *
 * @param blockId The ID of the block to update.
 * @returns An object with stable `handleUrlChange` and `handleBoundsChange` callbacks.
 */
export const useBrowserViewUpdater = (blockId: string) => {
  const urlRef = useRef<string | null>(null);
  const boundsRef = useRef<Bounds | null>(null);

  const sendUpdate = useCallback(() => {
    // Only send the update if we have both a URL and bounds.
    if (urlRef.current && boundsRef.current) {
      console.log(
        `[useBrowserViewUpdater] Sending update for block ${blockId}`
      );
      window.electronAPI.updateBrowser({
        blockId,
        url: urlRef.current,
        bounds: boundsRef.current,
      });
    }
  }, [blockId]);

  const handleUrlChange = useCallback(
    (url: string | null) => {
      if (url && url !== urlRef.current) {
        urlRef.current = url;
        sendUpdate();
      }
    },
    [sendUpdate]
  );

  const handleBoundsChange = useCallback(
    (newBounds: Bounds) => {
      const currentBounds = boundsRef.current;
      // Prevent feedback loop by checking if bounds have actually changed.
      if (
        currentBounds &&
        currentBounds.x === newBounds.x &&
        currentBounds.y === newBounds.y &&
        currentBounds.width === newBounds.width &&
        currentBounds.height === newBounds.height
      ) {
        return;
      }
      boundsRef.current = newBounds;
      sendUpdate();
    },
    [sendUpdate]
  );

  return { handleUrlChange, handleBoundsChange };
};
