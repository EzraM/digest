import { useCallback } from "react";
import { log } from "../utils/rendererLogger";

type UseDocumentActionsParams = {
  activeDocumentId: string | null;
  onPendingDocumentRemoved: (documentId: string) => void;
  navigateToDoc?: (docId: string) => void;
};

export const useDocumentActions = ({
  activeDocumentId,
  onPendingDocumentRemoved,
  navigateToDoc,
}: UseDocumentActionsParams) => {
  const handleDocumentSelect = useCallback(
    (documentId: string) => {
      // Skip if already on this document
      if (documentId === activeDocumentId) {
        return;
      }

      // Navigate to the doc route - the effect in RendererApp will sync Electron state
      navigateToDoc?.(documentId);
    },
    [activeDocumentId, navigateToDoc]
  );

  const handleRenameDocument = useCallback(
    async (documentId: string, title: string) => {
      if (!window.electronAPI?.documents) {
        return null;
      }

      try {
        return await window.electronAPI.documents.rename({
          documentId,
          title,
        });
      } catch (error) {
        log.debug(`Failed to rename document: ${error}`, "renderer");
        return null;
      }
    },
    []
  );

  const handleDeleteDocument = useCallback(
    async (documentId: string) => {
      if (!window.electronAPI?.documents) {
        return false;
      }

      try {
        await window.electronAPI.documents.delete(documentId);
        onPendingDocumentRemoved(documentId);
        return true;
      } catch (error) {
        log.debug(`Failed to delete document: ${error}`, "renderer");
        return false;
      }
    },
    [onPendingDocumentRemoved]
  );

  const handleMoveDocumentToProfile = useCallback(
    async (documentId: string, newProfileId: string) => {
      if (!window.electronAPI?.documents) {
        return false;
      }

      try {
        await window.electronAPI.documents.moveToProfile({
          documentId,
          newProfileId,
        });
        return true;
      } catch (error) {
        log.debug(`Failed to move document to profile: ${error}`, "renderer");
        return false;
      }
    },
    []
  );

  const handleMoveDocumentWithinTree = useCallback(
    async ({
      documentId,
      newParentId,
      position,
    }: {
      documentId: string;
      newParentId: string | null;
      position: number;
    }) => {
      if (!window.electronAPI?.documents) {
        return false;
      }

      try {
        await window.electronAPI.documents.move({
          documentId,
          newParentId,
          position,
        });
        return true;
      } catch (error) {
        log.debug(`Failed to move document within tree: ${error}`, "renderer");
        return false;
      }
    },
    []
  );

  return {
    handleDocumentSelect,
    handleRenameDocument,
    handleDeleteDocument,
    handleMoveDocumentToProfile,
    handleMoveDocumentWithinTree,
  };
};
