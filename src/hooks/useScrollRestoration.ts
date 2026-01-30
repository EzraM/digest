import { useEffect, useRef } from "react";
import { useLocation } from "@tanstack/react-router";

/**
 * Custom scroll restoration hook for container-based scrolling.
 *
 * TanStack Router's built-in scroll restoration only works with window.scrollY.
 * This hook saves and restores scroll position for a specific container element.
 */
export function useScrollRestoration(
  containerRef: React.RefObject<HTMLElement | null>,
  options?: {
    /** Key to identify unique scroll positions (defaults to pathname) */
    getKey?: (pathname: string, searchStr: string) => string;
    /** Delay before restoring scroll (ms) - allows content to render */
    restoreDelay?: number;
  }
) {
  const location = useLocation();
  const scrollPositions = useRef<Map<string, number>>(new Map());
  const lastKey = useRef<string | null>(null);

  const getKey = options?.getKey ?? ((pathname) => pathname);
  const restoreDelay = options?.restoreDelay ?? 0;

  // Save scroll position when navigating away
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const currentKey = getKey(location.pathname, location.searchStr);

    // Save the previous position before updating key
    if (lastKey.current && lastKey.current !== currentKey) {
      scrollPositions.current.set(lastKey.current, container.scrollTop);
    }

    lastKey.current = currentKey;
  }, [location.pathname, location.searchStr, containerRef, getKey]);

  // Restore scroll position when returning to a route
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const currentKey = getKey(location.pathname, location.searchStr);
    const savedPosition = scrollPositions.current.get(currentKey);

    if (savedPosition !== undefined) {
      // Use setTimeout to allow content to render first
      const timeoutId = setTimeout(() => {
        container.scrollTop = savedPosition;
      }, restoreDelay);

      return () => clearTimeout(timeoutId);
    } else {
      // New route - scroll to top
      container.scrollTop = 0;
    }
  }, [location.pathname, location.searchStr, containerRef, getKey, restoreDelay]);

  // Save position on unmount (in case of navigation)
  useEffect(() => {
    const container = containerRef.current;
    return () => {
      if (container && lastKey.current) {
        scrollPositions.current.set(lastKey.current, container.scrollTop);
      }
    };
  }, [containerRef]);
}
