import { useEffect } from "react";
import { CustomBlockNoteEditor } from "../types/schema";
import { log } from "../utils/rendererLogger";

/**
 * Custom hook to synchronize document state with the main process
 * This enables the main process to have current document context for LLM prompts
 */
export const useDocumentSync = (editor: CustomBlockNoteEditor) => {
  // Helper function to serialize current document state
  const serializeDocumentState = (): any => {
    if (!editor) return null;

    try {
      // Get the current document state from BlockNote
      const document = editor.document;

      return {
        document: document, // Full document structure
        blockCount: document.length,
        timestamp: Date.now(),
        // Add any other context we might want
      };
    } catch (error) {
      log.debug(`Error serializing document: ${error}`, "useDocumentSync");
      return null;
    }
  };

  useEffect(() => {
    if (!editor || !window.electronAPI?.updateDocumentState) {
      return;
    }

    // Send initial document state
    const initialState = serializeDocumentState();
    if (initialState) {
      window.electronAPI.updateDocumentState(initialState);
      log.debug(
        `Sent initial document state: ${initialState.blockCount} blocks`,
        "useDocumentSync"
      );
    }

    // Set up document change listener with debouncing to avoid excessive updates
    let updateTimeout: NodeJS.Timeout;
    const handleDocumentChange = () => {
      clearTimeout(updateTimeout);
      updateTimeout = setTimeout(() => {
        const documentState = serializeDocumentState();
        if (documentState) {
          window.electronAPI.updateDocumentState(documentState);
          log.debug(
            `Document updated: ${documentState.blockCount} blocks`,
            "useDocumentSync"
          );
        }
      }, 500); // Debounce for 500ms
    };

    // Listen for document changes
    editor.onChange(handleDocumentChange);

    // Cleanup function
    return () => {
      clearTimeout(updateTimeout);
      // BlockNote doesn't provide a way to remove onChange listeners
      // so we'll rely on the useEffect cleanup
    };
  }, [editor]);
};
