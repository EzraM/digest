import { useEffect, useRef } from "react";
import { CustomBlockNoteEditor } from "../types/schema";
import { log } from "../utils/rendererLogger";
import { useDebounced } from "./useDebounced";

/**
 * Custom hook to synchronize document state and operations with the main process.
 * Handles persistence by saving user operations to Y.js + SQLite.
 */
export const useDocumentSync = (editor: CustomBlockNoteEditor) => {
  // Track the last known document state to detect real changes
  const lastDocumentRef = useRef<any[] | null>(null);

  // Track when we're expecting a Y.js update (cleaner than handler manipulation)
  const expectingYjsSyncRef = useRef(false);

  // ROLE 1: Debounced function to save user operations for persistence
  const saveUserOperation = useDebounced<{ document: any[]; changes: any[] }>(
    ({ document, changes }) => {
      const operation = {
        id: `user-edit-${Date.now()}`,
        type: "update" as const,
        blockId: "document-root",
        source: "user" as const,
        timestamp: Date.now(),
        block: null as any,
        document: document,
        changes: changes,
        userId: "local-user",
        requestId: `user-edit-${Date.now()}`,
      };

      const origin = {
        source: "user" as const,
        batchId: `user-batch-${Date.now()}`,
        requestId: `user-edit-${Date.now()}`,
        timestamp: Date.now(),
      };

      log.debug(
        `Saving user operation with ${document.length} blocks (after 2s delay)`,
        "useDocumentSync"
      );

      (window.electronAPI as any)
        ?.applyBlockOperations([operation], origin)
        .then((result: any) => {
          log.debug(
            `User operation saved: ${result.operationsApplied} operations`,
            "useDocumentSync"
          );
        })
        .catch((error: any) => {
          log.debug(`Error saving user operation: ${error}`, "useDocumentSync");
        });
    },
    2000
  );

  useEffect(() => {
    if (!editor || !window.electronAPI) return;

    // Handle document changes - but filter intelligently
    const handleDocumentChange = (
      currentEditor: CustomBlockNoteEditor,
      options?: { getChanges?: () => any[] }
    ) => {
      const currentDocument = currentEditor.document;

      // Check if this change was expected from Y.js sync
      if (expectingYjsSyncRef.current) {
        log.debug(
          "Document changed from Y.js sync - updating tracking without persisting",
          "useDocumentSync"
        );
        lastDocumentRef.current = currentDocument;
        expectingYjsSyncRef.current = false; // Reset flag
        return;
      }

      // Check if document actually changed (avoid duplicate operations)
      if (
        lastDocumentRef.current &&
        JSON.stringify(currentDocument) ===
          JSON.stringify(lastDocumentRef.current)
      ) {
        log.debug("Document unchanged - skipping operation", "useDocumentSync");
        return;
      }

      // This is a genuine user edit - persist changes
      lastDocumentRef.current = currentDocument;

      // Extract changes if available from BlockNote's onChange callback
      const changes = options?.getChanges?.() ?? [];
      saveUserOperation({ document: currentDocument, changes });

      log.debug(
        `User edited document: ${currentDocument.length} blocks (queued for save)`,
        "useDocumentSync"
      );
    };

    // Handle Y.js updates from main process
    const handleYjsSync = (updateData: any) => {
      if (!updateData?.blocks || !Array.isArray(updateData.blocks)) return;

      const { blocks, origin } = updateData;

      // Use transaction metadata to determine if we should apply this update
      const isUserOriginated = origin?.source === "user";
      const isSystemOriginated = origin?.source === "system" || !origin;

      if (isUserOriginated) {
        // Skip user-originated Y.js updates to prevent loops
        log.debug(
          `Skipping Y.js sync from user operation (${origin.batchId})`,
          "useDocumentSync"
        );
        return;
      }

      if (isSystemOriginated) {
        log.debug(
          `Applying Y.js sync from system: ${blocks.length} blocks${
            origin ? ` (${origin.batchId})` : ""
          }`,
          "useDocumentSync"
        );

        try {
          // Set expectation flag BEFORE applying blocks
          expectingYjsSyncRef.current = true;

          // Apply the Y.js update - this will trigger onChange
          editor.replaceBlocks(editor.document, blocks);

          // The onChange will see the flag and handle it appropriately
          log.debug("Y.js sync applied successfully", "useDocumentSync");
        } catch (error) {
          expectingYjsSyncRef.current = false; // Reset on error
          log.debug(`Y.js sync failed: ${error}`, "useDocumentSync");
        }
      }
    };

    // Send initial document state and set up tracking
    const initialDocument = editor.document;
    lastDocumentRef.current = initialDocument;

    // Set up event listeners (no handler manipulation!)
    editor.onChange(handleDocumentChange);

    if (window.electronAPI?.onDocumentUpdate) {
      window.electronAPI.onDocumentUpdate(handleYjsSync);
    }

    // Signal to main process that renderer is ready to receive document updates
    if (window.electronAPI?.signalRendererReady) {
      window.electronAPI.signalRendererReady();
    }

    // Cleanup
    return () => {
      if (window.electronAPI?.removeDocumentUpdateListener) {
        window.electronAPI.removeDocumentUpdateListener(handleYjsSync);
      }
    };
  }, [editor, saveUserOperation]);
};
