import { IPCHandlerMap } from "../IPCRouter";
import { DocumentManager } from "../../services/DocumentManager";
import { WebContentsView } from "electron";
import { log } from "../../utils/mainLogger";
import { ImageService } from "../../services/ImageService";
import { BlockOperation } from "../../types/operations";

export function createBlockHandlers(
  documentManager: DocumentManager,
  rendererView: WebContentsView | null,
  imageService?: ImageService
): IPCHandlerMap {
  return {
    "block-operations:apply": {
      type: "invoke",
      fn: async (_event, operations: unknown[], origin?: unknown) => {
        try {
          log.debug(
            `IPC: Applying ${operations.length} block operations ${
              (origin as any)?.batchId
                ? `(batch: ${(origin as any).batchId})`
                : ""
            }`,
            "main"
          );

          const activeDocument =
            documentManager.activeDocument ??
            documentManager.listDocuments()[0];
          if (!activeDocument) {
            throw new Error("No active document available for operations");
          }

          const blockOperationService = documentManager.getBlockService(
            activeDocument.id
          );

          if (rendererView && !rendererView.webContents.isDestroyed()) {
            blockOperationService.setRendererWebContents(rendererView);
          }

          // Clean up images for deleted blocks BEFORE applying operations
          // Extract blocks before deletion to get image IDs
          if (imageService && operations.length > 0) {
            const deleteOperations = (operations as BlockOperation[]).filter(
              (op) => op.type === "delete"
            );
            for (const deleteOp of deleteOperations) {
              try {
                // Get the block from Y.js before it's deleted
                const blocks = blockOperationService.getBlocks();
                const blockToDelete = blocks.find(
                  (b: any) => b.id === deleteOp.blockId
                );
                if (blockToDelete) {
                  const imageIds =
                    ImageService.extractImageIdsFromBlock(blockToDelete);
                  for (const imageId of imageIds) {
                    imageService.deleteImage(imageId);
                  }
                  if (imageIds.length > 0) {
                    log.debug(
                      `Cleaned up ${imageIds.length} images for deleted block ${deleteOp.blockId}`,
                      "blockHandlers"
                    );
                  }
                }
              } catch (error) {
                log.debug(
                  `Error cleaning up images for block ${deleteOp.blockId}: ${error}`,
                  "blockHandlers"
                );
              }
            }
          }

          // Apply operations (this will delete blocks)
          const result = await blockOperationService.applyOperations(
            operations as any,
            origin as any
          );

          log.debug(
            `IPC: Block operations result: ${
              result.operationsApplied
            } applied, success: ${result.success}${
              result.batchId ? `, batch: ${result.batchId}` : ""
            }`,
            "main"
          );

          return result;
        } catch (error) {
          log.debug(`IPC: Error applying block operations: ${error}`, "main");
          return {
            success: false,
            operationsApplied: 0,
            errors: [error instanceof Error ? error.message : "Unknown error"],
          };
        }
      },
    },
  };
}
