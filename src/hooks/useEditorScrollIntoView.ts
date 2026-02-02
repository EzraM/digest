import { useEffect } from "react";

/** Minimal editor interface for scroll-to-block (BlockNote editor) */
interface EditorWithBlockPosition {
  getBlock: (blockId: string) => unknown;
  setTextCursorPosition: (blockId: string, placement?: "start" | "end") => void;
  focus: () => void;
}

/**
 * Custom hook to scroll a block into view in the editor pane.
 * When a focusBlockId is provided, it scrolls to the corresponding block element
 * after a short delay to ensure the DOM is ready.
 * For site (browser) blocks, uses #site-block-{id}. For other blocks, uses the
 * editor's setTextCursorPosition so BlockNote/ProseMirror scrolls the block into view.
 *
 * @param focusBlockId - The ID of the block to scroll into view, or null/undefined to skip scrolling
 * @param editor - Optional BlockNote editor; when provided and no site-block element exists, moves cursor to block and focuses
 */
export const useEditorScrollIntoView = (
  focusBlockId?: string | null,
  editor?: EditorWithBlockPosition | null
): void => {
  useEffect(() => {
    if (!focusBlockId) {
      return;
    }
    const timeoutId = setTimeout(() => {
      const siteBlockEl = document.getElementById(
        `site-block-${focusBlockId}`
      );
      if (siteBlockEl) {
        siteBlockEl.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
      if (editor?.getBlock(focusBlockId)) {
        try {
          editor.setTextCursorPosition(focusBlockId, "start");
          editor.focus();
        } catch {
          // Block may not be in DOM yet; ignore
        }
      }
    }, 200);
    return () => clearTimeout(timeoutId);
  }, [focusBlockId, editor]);
};
