import { useCallback, useRef } from "react";
import { DocumentTreeNode } from "../types/documents";
import { log } from "../utils/rendererLogger";

type UseProfileSelectionParams = {
  documentTrees: Record<string, DocumentTreeNode[]>;
  setActiveProfileId: (profileId: string) => void;
  openDocument: (documentId: string) => void;
};

export const useProfileSelection = ({
  documentTrees,
  setActiveProfileId,
  openDocument,
}: UseProfileSelectionParams) => {
  const requestRef = useRef(0);

  return useCallback(
    async (profileId: string) => {
      const requestId = ++requestRef.current;
      setActiveProfileId(profileId);

      try {
        const tree =
          documentTrees[profileId]
          ?? await window.electronAPI?.documents?.getTree(profileId);
        if (requestId !== requestRef.current) return;

        const firstDocument = tree?.[0]?.document;
        if (firstDocument) {
          openDocument(firstDocument.id);
        }
      } catch (error) {
        log.debug(
          `Failed to open first page for profile ${profileId}: ${error}`,
          "renderer"
        );
      }
    },
    [documentTrees, openDocument, setActiveProfileId]
  );
};
