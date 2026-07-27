import { useEffect } from "react";
import { ClipService } from "../domains/clip/services/ClipService";
import { ClipConverter } from "../domains/clip/services/ClipConverter";
import { ClipCommitService } from "../domains/clip/services/ClipCommitService";
import { log } from "../utils/rendererLogger";
import { NotebookAddress } from "../domains/notebook-content/core/NotebookAddress";
import { RendererNotebookWriter } from "../domains/notebook-content/application/RendererNotebookWriter";

/**
 * Listen for browser selections and insert them directly into the notebook.
 */
export const useBrowserSelection = (
  notebookAddress: NotebookAddress | null,
  notebookWriter: RendererNotebookWriter | null
) => {
  const clipService = ClipService.getInstance();
  const clipConverter = ClipConverter.getInstance();
  const clipCommitService = ClipCommitService.getInstance();

  useEffect(() => {
    const unsubscribe = window.electronAPI.onBrowserSelection(async (data) => {
      log.debug(
        `Received browser selection from block ${data.blockId}`,
        "useBrowserSelection"
      );

      // Preserve the address before conversion does any asynchronous work.
      const address = notebookAddress;
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

        const { operations } =
          await clipCommitService.createClipOperations(convertedDraft);
        if (!address || !notebookWriter) {
          throw new Error("No notebook address is available");
        }
        if (!notebookWriter.applyOperations(address, operations)) {
          throw new Error("The notebook address has no insertion anchor");
        }

        clipService.deleteDraft(draft.id);
        log.debug(
          `Inserted browser selection at ${JSON.stringify(address)}`,
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
  }, [
    clipCommitService,
    clipConverter,
    clipService,
    notebookAddress,
    notebookWriter,
  ]);
};
