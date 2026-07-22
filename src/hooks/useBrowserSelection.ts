import { useEffect } from "react";
import { ClipService } from "../domains/clip/services/ClipService";
import { ClipConverter } from "../domains/clip/services/ClipConverter";
import { ClipCommitService } from "../domains/clip/services/ClipCommitService";
import { getCurrentCursorBlockId } from "./useRendererEditor";
import { log } from "../utils/rendererLogger";

/**
 * Listen for browser selections and insert them directly into the notebook.
 */
export const useBrowserSelection = () => {
  const clipService = ClipService.getInstance();
  const clipConverter = ClipConverter.getInstance();
  const clipCommitService = ClipCommitService.getInstance();

  useEffect(() => {
    const unsubscribe = window.electronAPI.onBrowserSelection(async (data) => {
      log.debug(
        `Received browser selection from block ${data.blockId}`,
        "useBrowserSelection"
      );

      // Capture the notebook anchor before conversion does any asynchronous work.
      const insertAfterBlockId = getCurrentCursorBlockId() ?? undefined;
      const draft = clipService.createDraft({
        sourceUrl: data.sourceUrl,
        sourceTitle: data.sourceTitle,
        selectionText: data.selectionText,
        selectionHtml: data.selectionHtml,
        context: {
          frameUrl: data.sourceUrl,
        },
      });

      try {
        const proposedBlocks = await clipConverter.convertToBlocks(draft);
        const convertedDraft = clipService.updateDraft(draft.id, {
          proposedBlocks,
          conversion: draft.conversion,
        });

        if (!convertedDraft) {
          throw new Error("Captured selection was no longer available");
        }

        const { operations, origin } =
          await clipCommitService.createClipOperations(
            convertedDraft,
            insertAfterBlockId
          );
        const result = await window.electronAPI.applyBlockOperations(
          operations,
          origin
        );

        if (!result.success) {
          throw new Error(result.errors?.join(", ") || "Unknown insertion error");
        }

        clipService.deleteDraft(draft.id);
        log.debug(
          `Inserted browser selection after ${insertAfterBlockId ?? "document end"}`,
          "useBrowserSelection"
        );
      } catch (error) {
        clipService.deleteDraft(draft.id);
        log.debug(
          `Failed to insert browser selection: ${error instanceof Error ? error.message : String(error)}`,
          "useBrowserSelection"
        );
        console.error("Failed to add selection to notebook:", error);
      }
    });

    return unsubscribe;
  }, [clipCommitService, clipConverter, clipService]);
};

