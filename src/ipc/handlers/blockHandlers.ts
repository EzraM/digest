import { IPCHandlerMap } from "../IPCRouter";
import { DocumentManager } from "../../services/DocumentManager";
import { WebContentsView } from "electron";
import { log } from "../../utils/mainLogger";
import { ImageService } from "../../services/ImageService";
import { BlockOperation } from "../../domains/blocks/core";

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
          // Extract deletions from the changes array
          if (imageService && operations.length > 0) {
            for (const op of operations) {
              // Check for deletions in the changes array
              const changes = (op as any).changes ?? [];
              const deletions = changes.filter((c: any) => c.type === "delete");

              for (const deletion of deletions) {
                try {
                  const deletedBlock = deletion.block;
                  if (!deletedBlock) continue;

                  const imageIds =
                    ImageService.extractImageIdsFromBlock(deletedBlock);

                  for (const imageId of imageIds) {
                    const deleted = imageService.deleteImage(imageId);
                    if (deleted) {
                      log.debug(
                        `Cleaned up image ${imageId} for deleted block ${deletedBlock.id}`,
                        "blockHandlers"
                      );
                    }
                  }

                  if (imageIds.length > 0) {
                    log.debug(
                      `Cleaned up ${imageIds.length} image(s) for deleted block ${deletedBlock.id}`,
                      "blockHandlers"
                    );
                  }
                } catch (error) {
                  log.debug(
                    `Error cleaning up images for deleted block: ${error}`,
                    "blockHandlers"
                  );
                }
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
