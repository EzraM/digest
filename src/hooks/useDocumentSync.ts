import { useEffect } from "react";
import { CustomBlockNoteEditor } from "../types/schema";
import { log } from "../utils/rendererLogger";
import { BlockNoteOperationConverter } from "../services/BlockNoteOperationConverter";
import { BlockChange, DocumentUpdate } from "../types/operations";

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

    // Track previous document state to detect changes
    let previousDocument: any[] = editor.document;

    // Set up unified document change listener for operations and state sync
    let stateUpdateTimeout: NodeJS.Timeout;
    const handleDocumentChange = (currentEditor: CustomBlockNoteEditor) => {
      try {
        const currentDocument = currentEditor.document;

        // Simple change detection by comparing document snapshots
        if (
          JSON.stringify(currentDocument) !== JSON.stringify(previousDocument)
        ) {
          log.debug(
            `Document changed from user: ${previousDocument.length} → ${currentDocument.length} blocks`,
            "useDocumentSync"
          );

          // Create a simple operation from the document changes
          // This is a simplified approach - treats document-level changes as operations
          const operations = [
            {
              id: `user-edit-${Date.now()}`,
              type: "update" as const,
              blockId: "document-root",
              source: "user" as const,
              timestamp: Date.now(),
              block: null as any, // We'll send the full document instead
              document: currentDocument,
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
            `Sending user document operation with ${currentDocument.length} blocks`,
            "useDocumentSync"
          );

          // Apply operations with transaction metadata
          (window.electronAPI as any)
            ?.applyBlockOperations(operations, origin)
            .then((result: any) => {
              log.debug(
                `Applied user operation successfully: ${result.operationsApplied} operations`,
                "useDocumentSync"
              );
            })
            .catch((error: any) => {
              log.debug(
                `Error applying user operation: ${error}`,
                "useDocumentSync"
              );
            });

          // Update previous document snapshot
          previousDocument = JSON.parse(JSON.stringify(currentDocument));
        }
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

    // Cleanup function
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
