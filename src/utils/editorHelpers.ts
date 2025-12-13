import { CustomBlockNoteEditor } from "../types/schema";

/**
 * Check if the editor's TipTap view is available.
 * The editor object may exist, but TipTap's internal view may be torn down
 * during route transitions, causing errors when accessing editor.view.dom
 *
 * This is the source of the "[tiptap error]: The editor view is not available"
 * error that occurs during route transitions.
 */
export const isEditorViewAvailable = (
  editor: CustomBlockNoteEditor
): boolean => {
  if (!editor || typeof editor.getBlock !== "function") {
    return false;
  }
  // Check if TipTap view is available (the actual source of the error)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (editor as any).view?.dom !== undefined;
};


