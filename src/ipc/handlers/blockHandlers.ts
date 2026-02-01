import { IPCHandlerMap } from "../IPCRouter";
import { DocumentManager } from "../../services/DocumentManager";
import { WebContentsView } from "electron";
import { log } from "../../utils/mainLogger";
import type { BlockOperationsApplier } from "../../domains/blocks/services";

export function createBlockHandlers(
  documentManager: DocumentManager,
  rendererView: WebContentsView | null,
  blockOperationsApplier: BlockOperationsApplier
): IPCHandlerMap {
  return {
    "block-operations:apply": {
      type: "invoke",
      fn: async (_event, operations: unknown[], origin?: unknown) => {
        try {
          log.debug(
            `IPC: Applying ${operations.length} block operations ${
              (origin as { batchId?: string })?.batchId
                ? `(batch: ${(origin as { batchId?: string }).batchId})`
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

          const blockService = documentManager.getBlockService(activeDocument.id);
          if (rendererView && !rendererView.webContents.isDestroyed()) {
            blockService.setRendererWebContents(rendererView);
          }

          const result = await blockOperationsApplier.apply(
            activeDocument.id,
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
