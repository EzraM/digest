import { useEffect } from "react";

/**
 * Custom hook to scroll a block into view in the editor pane.
 * When a focusBlockId is provided, it scrolls to the corresponding block element
 * after a short delay to ensure the DOM is ready.
 *
 * @param focusBlockId - The ID of the block to scroll into view, or null/undefined to skip scrolling
 */
export const useEditorScrollIntoView = (focusBlockId?: string | null): void => {
  useEffect(() => {
    if (!focusBlockId) {
      return;
    }
    const timeoutId = setTimeout(() => {
      const target = document.getElementById(`site-block-${focusBlockId}`);
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 200);
    return () => clearTimeout(timeoutId);
  }, [focusBlockId]);
};

