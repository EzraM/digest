import { useState, useCallback, useEffect } from "react";
import { ClipDraft } from "../types/clip";
import { ClipService } from "../services/ClipService";
import { ClipConverter } from "../services/ClipConverter";
import { log } from "../utils/rendererLogger";

/**
 * Hook to manage clip draft state
 * Similar to useBlockNotification but for clip drafts
 */
export const useClipDraft = () => {
  const [drafts, setDrafts] = useState<ClipDraft[]>([]);
  const clipService = ClipService.getInstance();
  const clipConverter = ClipConverter.getInstance();

  // Load drafts from service on mount
  useEffect(() => {
    const allDrafts = clipService.getAllDrafts();
    setDrafts(allDrafts);
  }, []);

  const addDraft = useCallback(
    async (draft: ClipDraft) => {
      log.debug(`Adding clip draft: ${draft.id}`, "useClipDraft");

      // Create draft in service
      clipService.updateDraft(draft.id, draft);

      // Convert to blocks
      try {
        const blocks = await clipConverter.convertToBlocks(draft);
        // convertToBlocks mutates draft.conversion.status, so preserve it
        const updated = clipService.updateDraft(draft.id, {
          proposedBlocks: blocks,
          conversion: draft.conversion, // Preserve conversion status (completed/failed)
        });
        if (updated) {
          setDrafts(clipService.getAllDrafts());
        }
      } catch (error) {
        log.debug(
          `Error converting draft ${draft.id}: ${error}`,
          "useClipDraft"
        );
      }

      setDrafts(clipService.getAllDrafts());
    },
    [clipService, clipConverter]
  );

  const removeDraft = useCallback(
    (id: string) => {
      log.debug(`Removing clip draft: ${id}`, "useClipDraft");
      clipService.deleteDraft(id);
      setDrafts(clipService.getAllDrafts());
    },
    [clipService]
  );

  const updateDraft = useCallback(
    (id: string, updates: Partial<ClipDraft>) => {
      log.debug(`Updating clip draft: ${id}`, "useClipDraft");
      clipService.updateDraft(id, updates);
      setDrafts(clipService.getAllDrafts());
    },
    [clipService]
  );

  const getDraft = useCallback(
    (id: string) => {
      return clipService.getDraft(id);
    },
    [clipService]
  );

  return {
    drafts,
    addDraft,
    removeDraft,
    updateDraft,
    getDraft,
  };
};


