import { useEffect } from "react";
import { CustomBlockNoteEditor } from "../types/schema";
import { log } from "../utils/rendererLogger";
import { BlockNoteOperationConverter } from "../services/BlockNoteOperationConverter";
import { BlockChange, DocumentUpdate } from "../types/operations";
import { useDebounced } from "./useDebounced";

/**
 * Custom hook to synchronize document state and operations with the main process
 * This enables unified operation processing for both user and LLM edits
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

  // ✅ Move useDebounced to top level - hooks must be called at component/hook top level
  const sendUserOperation = useDebounced<any[]>(
    (document: any[]) => {
      const operations = [
        {
          id: `user-edit-${Date.now()}`,
          type: "update" as const,
          blockId: "document-root",
          source: "user" as const,
          timestamp: Date.now(),
          block: null as any, // We'll send the full document instead
          document: document,
          userId: "local-user",
          requestId: `user-edit-${Date.now()}`,
        },
      ];

      const origin = {
        source: "user" as const,
        batchId: `user-batch-${Date.now()}`,
        requestId: `user-edit-${Date.now()}`,
        timestamp: Date.now(),
      };

      log.debug(
        `Sending debounced user operation with ${document.length} blocks (after 2s delay)`,
        "useDocumentSync"
      );

      // Apply operations with transaction metadata
      (window.electronAPI as any)
        ?.applyBlockOperations(operations, origin)
        .then((result: any) => {
          log.debug(
            `Applied debounced user operation successfully: ${result.operationsApplied} operations`,
            "useDocumentSync"
          );
        })
        .catch((error: any) => {
          log.debug(
            `Error applying debounced user operation: ${error}`,
            "useDocumentSync"
          );
        });
    },
    2000 // 2 seconds after typing stops
  );

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

    // Set up document change listener - much simpler now!
    let stateUpdateTimeout: NodeJS.Timeout;
    const handleDocumentChange = (currentEditor: CustomBlockNoteEditor) => {
      try {
        const currentDocument = currentEditor.document;

        // Send to debounced operation handler - the hook handles deduplication and timing
        sendUserOperation(currentDocument);

        log.debug(
          `Document changed from user: ${currentDocument.length} blocks (queued for debouncing)`,
          "useDocumentSync"
        );
      } catch (error) {
        log.debug(
          `Error processing document changes: ${error}`,
          "useDocumentSync"
        );
      }

      // Continue with debounced state sync (for backup/context)
      clearTimeout(stateUpdateTimeout);
      stateUpdateTimeout = setTimeout(() => {
        const documentState = serializeDocumentState();
        if (documentState) {
          window.electronAPI.updateDocumentState(documentState);
          log.debug(
            `Document state synced: ${documentState.blockCount} blocks`,
            "useDocumentSync"
          );
        }
      }, 1000); // Longer debounce for state sync since operations handle real-time updates
    };

    // Listen for document changes - BlockNote passes the editor to the callback
    editor.onChange(handleDocumentChange);

    // Listen for document updates from main process (Y.js sync)
    const handleDocumentUpdate = (event: any, updateData: any) => {
      if (updateData && updateData.blocks && Array.isArray(updateData.blocks)) {
        // Apply updates from Y.js without triggering local operations
        // This prevents infinite loops when receiving updates from the main process
        log.debug(
          `Received document update from main process: ${updateData.blocks.length} blocks`,
          "useDocumentSync"
        );

        // TODO: Apply Y.js updates to BlockNote editor
        // This would require more complex integration with BlockNote's internal state
        // For now, we'll rely on the main process being the authoritative source
      }
    };

    // Set up IPC listener for updates from main process
    // TODO: Add these methods to ElectronAPI when we implement the IPC handlers
    // if (window.electronAPI?.onDocumentUpdate) {
    //   window.electronAPI.onDocumentUpdate(handleDocumentUpdate);
    // }

    // Cleanup function - useDebounced hook handles its own cleanup automatically
    return () => {
      clearTimeout(stateUpdateTimeout);

      // Remove IPC listener if possible
      // TODO: Add this method to ElectronAPI when we implement the IPC handlers
      // if (window.electronAPI?.removeDocumentUpdateListener) {
      //   window.electronAPI.removeDocumentUpdateListener(handleDocumentUpdate);
      // }

      // BlockNote doesn't provide a way to remove onChange listeners
      // so we'll rely on the useEffect cleanup
    };
  }, [editor]);

  // Return helper functions for external use if needed
  return {
    serializeDocumentState,
    // Add other utilities as needed
  };
};
