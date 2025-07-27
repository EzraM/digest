import { useEffect, RefObject } from "react";
import { useSize } from "../Browser/hooks/useSize";
import { log } from "../utils/rendererLogger";

/**
 * Hook to track prompt overlay bounds and send them to main process
 * Based on the pattern used in useBrowserViewUpdater
 */
export function usePromptOverlayBounds(ref: RefObject<HTMLElement>) {
  const size = useSize(ref);

  useEffect(() => {
    if (size && window.electronAPI?.updatePromptOverlayBounds) {
      const { width = 0, height = 0 } = size;
      const x = typeof size.x === "number" ? size.x : 0;
      const y = typeof size.y === "number" ? size.y : 0;

      const bounds = { x, y, width, height };
      
      log.debug(
        `Sending prompt overlay bounds: ${JSON.stringify(bounds)} (viewport: ${window.innerWidth}x${window.innerHeight})`,
        "usePromptOverlayBounds"
      );
      
      window.electronAPI.updatePromptOverlayBounds(bounds);
    }
  }, [size]);

  // Initial bounds check on mount with getBoundingClientRect
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (ref.current && window.electronAPI?.updatePromptOverlayBounds) {
        const rect = ref.current.getBoundingClientRect();
        const bounds = {
          x: typeof rect.x === "number" ? rect.x : 0,
          y: typeof rect.y === "number" ? rect.y : 0,
          width: rect.width || 0,
          height: rect.height || 0,
        };
        
        log.debug(
          `Initial prompt overlay bounds: ${JSON.stringify(bounds)} (viewport: ${window.innerWidth}x${window.innerHeight})`,
          "usePromptOverlayBounds"
        );
        
        window.electronAPI.updatePromptOverlayBounds(bounds);
      }
    }, 100);
    
    return () => clearTimeout(timeoutId);
  }, [ref]);
}