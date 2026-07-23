import { useEffect } from "react";
import { ClipService } from "../domains/clip/services/ClipService";
import { ClipConverter } from "../domains/clip/services/ClipConverter";
import { ClipCommitService } from "../domains/clip/services/ClipCommitService";
import { getCurrentCursorBlockId } from "./useRendererEditor";
import { log } from "../utils/rendererLogger";

/**
 * Listens for right-click image clips and inserts them into the notebook.
 */
export const useBrowserImageClips = (documentId: string | null) => {
  const clipService = ClipService.getInstance();
  const clipConverter = ClipConverter.getInstance();
  const clipCommitService = ClipCommitService.getInstance();

  useEffect(() => {
    const unsubscribe = window.electronAPI.onBrowserImageClipped(async (data) => {
      log.debug(
        `Received clipped image ${data.imageId} from block ${data.blockId}`,
        "useBrowserImageClips"
      );

      const insertAfterBlockId = getCurrentCursorBlockId() ?? undefined;
      const alt = data.altText ? ` alt="${escapeHtml(data.altText)}"` : "";
      const width = data.width ? ` width="${data.width}"` : "";
      const height = data.height ? ` height="${data.height}"` : "";

      const draft = clipService.createDraft({
        sourceUrl: data.sourceUrl,
        sourceTitle: data.sourceTitle,
        selectionText: data.altText || "",
        selectionHtml: `<img src="${data.localImageUrl}"${alt}${width}${height}>`,
        context: {
          frameUrl: data.sourceUrl,
          originalImageUrl: data.originalImageUrl,
          localImageUrl: data.localImageUrl,
          imageIds: [data.imageId],
        },
      });
      let inserted = false;

      try {
        const proposedBlocks = await clipConverter.convertToBlocks(draft);
        const convertedDraft = clipService.updateDraft(draft.id, {
          proposedBlocks,
          conversion: draft.conversion,
        });

        if (!convertedDraft) {
          throw new Error("Clipped image was no longer available");
        }

        const { operations, origin } =
          await clipCommitService.createClipOperations(
            convertedDraft,
            insertAfterBlockId
          );
        if (!documentId) throw new Error("No document selected");
        const result = await window.electronAPI.applyBlockOperations(
          documentId,
          operations,
          origin
        );

        if (!result.success) {
          throw new Error(result.errors?.join(", ") || "Unknown insertion error");
        }
        inserted = true;

        const activeDocument = await window.electronAPI.documents.getActive();
        if (activeDocument) {
          await window.electronAPI.image
            .attachImageToDocument({
              imageId: data.imageId,
              documentId: activeDocument.id,
            })
            .catch((error) => {
              log.debug(
                `Inserted image but failed to attach it to document ${activeDocument.id}: ${error}`,
                "useBrowserImageClips"
              );
            });
        }

        log.debug(
          `Inserted clipped image after ${insertAfterBlockId ?? "document end"}`,
          "useBrowserImageClips"
        );
      } catch (error) {
        if (!inserted) {
          await window.electronAPI.image
            .deleteImage(data.imageId)
            .catch(() => false);
        }
        log.debug(
          `Failed to insert clipped image: ${error instanceof Error ? error.message : String(error)}`,
          "useBrowserImageClips"
        );
        console.error("Failed to add clipped image to notebook:", error);
      } finally {
        clipService.deleteDraft(draft.id);
      }
    });

    return unsubscribe;
  }, [clipCommitService, clipConverter, clipService, documentId]);
};

const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
