import { IPCHandlerMap } from "../IPCRouter";
import { DocumentManager } from "../../services/DocumentManager";
import { WebContentsView } from "electron";
import { log } from "../../utils/mainLogger";
import type { BlockOperationsApplier } from "../../domains/blocks/services";

export function createBlockHandlers(
  documentManager: DocumentManager,
  rendererView: WebContentsView | null,
  blockOperationsApplier: BlockOperationsApplier,
  resolveWindowId: (rendererId: number) => string | undefined = () => undefined
): IPCHandlerMap {
  return {
    "block-operations:apply": {
      type: "invoke",
      fn: async (
        event,
        payload: {
          documentId: string;
          operations: unknown[];
          origin?: unknown;
        }
      ) => {
        try {
          if (
            !payload ||
            typeof payload.documentId !== "string" ||
            !Array.isArray(payload.operations)
          ) {
            throw new Error(
              "block-operations:apply requires documentId and operations"
            );
          }
          const { documentId, operations } = payload;
          const origin = {
            ...(typeof payload.origin === "object" && payload.origin
              ? payload.origin
              : {}),
            rendererId: event.sender.id,
            windowId: resolveWindowId(event.sender.id),
          };
          log.debug(
            `IPC: Applying ${operations.length} block operations ${
              (origin as { batchId?: string })?.batchId
                ? `(batch: ${(origin as { batchId?: string }).batchId})`
                : ""
            }`,
            "main"
          );

          documentManager.getDocument(documentId);
          const blockService = documentManager.getBlockService(documentId);
          if (rendererView && !rendererView.webContents.isDestroyed()) {
            blockService.setRendererWebContents(rendererView);
          }

          const result = await blockOperationsApplier.apply(
            documentId,
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
