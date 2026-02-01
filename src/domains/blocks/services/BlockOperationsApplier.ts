/**
 * BlockOperationsApplier
 *
 * Single entry point for applying block operations with middleware.
 * Runs pre-write pipeline → BlockOperationService.applyOperations → post-write pipeline.
 */

import type { BlockOperation, OperationResult, TransactionOrigin } from "../core";
import type { BlockMiddlewarePipeline } from "../core/middleware";
import type { DocumentManager } from "../../../services/DocumentManager";

export class BlockOperationsApplier {
  constructor(
    private readonly documentManager: DocumentManager,
    private readonly pipeline: BlockMiddlewarePipeline
  ) {}

  async apply(
    documentId: string,
    operations: BlockOperation[],
    origin?: TransactionOrigin
  ): Promise<OperationResult> {
    const blockService = this.documentManager.getBlockService(documentId);

    const modifiedOps = await this.pipeline.runPreWrite(operations, origin, {
      documentId,
      origin,
    });

    const result = await blockService.applyOperations(modifiedOps, origin);

    await this.pipeline.runPostWrite(modifiedOps, origin, result, {
      documentId,
      origin,
    });

    return result;
  }
}
