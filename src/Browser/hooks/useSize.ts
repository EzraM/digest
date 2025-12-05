import React, { useEffect } from "react";

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Hook that measures the visible bounds of an element using per-frame RAF calculations.
 * Uses IntersectionObserver only for coarse visibility detection to optimize performance.
 *
 * @param target - Ref to the element to measure
 * @param onBoundsChange - Callback that receives the visible bounds whenever they change
 * @param root - Optional root element to use as the intersection root (defaults to viewport)
 */
export const useSize = (
  target: React.RefObject<HTMLElement>,
  onBoundsChange?: (bounds: Bounds) => void,
  root?: React.RefObject<HTMLElement> | HTMLElement | null
) => {
  useEffect(() => {
    const element = target.current;
    if (!element || !onBoundsChange) {
      return;
    }

    // Get the root element for intersection calculation
    const rootElement =
      root instanceof HTMLElement ? root : (root?.current ?? null);

    // Calculate visible bounds by intersecting element rect with root/viewport
    // This runs every frame via RAF for precise, real-time updates
    const getVisibleBounds = (): Bounds | null => {
      // Batch DOM reads at start of frame
      const rect = element.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      let left: number;
      let top: number;
      let right: number;
      let bottom: number;

      if (rootElement) {
        // Intersect with root element bounds
        const rootRect = rootElement.getBoundingClientRect();
        left = Math.max(rootRect.left, rect.left);
        top = Math.max(rootRect.top, rect.top);
        right = Math.min(rootRect.right, rect.right);
        bottom = Math.min(rootRect.bottom, rect.bottom);
      } else {
        // Intersect with viewport
        left = Math.max(0, rect.left);
        top = Math.max(0, rect.top);
        right = Math.min(vw, rect.right);
        bottom = Math.min(vh, rect.bottom);
      }

      // Check if there's a valid intersection
      if (right <= left || bottom <= top) {
        return null; // Not visible
      }

      return {
        x: left,
        y: top,
        width: right - left,
        height: bottom - top,
      };
    };

    // Use IntersectionObserver only for coarse visibility detection
    // This tells us whether to run the RAF loop at all
    let isIntersecting = false;
    let rafId: number | null = null;
    let lastBounds: Bounds | null = null;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          // Coarse check: is element meaningfully visible?
          isIntersecting = entry.isIntersecting && entry.intersectionRatio > 0;

          // Start/stop RAF loop based on visibility
          if (isIntersecting && rafId === null) {
            // Element became visible, start RAF loop
            rafId = requestAnimationFrame(rafLoop);
          } else if (!isIntersecting && rafId !== null) {
            // Element no longer visible, stop RAF loop
            cancelAnimationFrame(rafId);
            rafId = null;
            // Notify that element is no longer visible
            if (lastBounds !== null) {
              lastBounds = null;
              onBoundsChange({ x: 0, y: 0, width: 0, height: 0 });
            }
          }
        }
      },
      {
        root: rootElement,
        // Simple threshold - just need to know if it's visible at all
        threshold: 0,
      }
    );

    observer.observe(element);

    // RAF loop for per-frame precise bounds calculation
    const rafLoop = () => {
      if (!element.isConnected || !isIntersecting) {
        rafId = null;
        return;
      }

      // Calculate visible bounds every frame
      const newBounds = getVisibleBounds();

      // Only call onBoundsChange if bounds actually changed
      if (
        newBounds &&
        (!lastBounds ||
          lastBounds.x !== newBounds.x ||
          lastBounds.y !== newBounds.y ||
          lastBounds.width !== newBounds.width ||
          lastBounds.height !== newBounds.height)
      ) {
        lastBounds = newBounds;
        onBoundsChange(newBounds);
      }

      // Continue loop while intersecting
      if (isIntersecting) {
        rafId = requestAnimationFrame(rafLoop);
      } else {
        rafId = null;
      }
    };

    // Check initial intersection and start loop if needed
    const initialEntries = observer.takeRecords();
    if (initialEntries.length > 0) {
      for (const entry of initialEntries) {
        isIntersecting = entry.isIntersecting && entry.intersectionRatio > 0;
        if (isIntersecting && rafId === null) {
          rafId = requestAnimationFrame(rafLoop);
        }
      }
    }

    return () => {
      observer.disconnect();
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    };
  }, [target, onBoundsChange, root]);
};
