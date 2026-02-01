/**
 * BlockMiddlewarePipeline
 *
 * Runs pre-write middlewares (transform chain) and post-write middlewares (observe).
 */

import type {
  BlockOperation,
  OperationResult,
  TransactionOrigin,
} from "../core";
import type {
  BlockMiddlewarePipeline as IBlockMiddlewarePipeline,
  BlockPostWriteContext,
  BlockPreWriteContext,
  IBlockPostWriteMiddleware,
  IBlockPreWriteMiddleware,
} from "../core/middleware";

export class BlockMiddlewarePipelineImpl implements IBlockMiddlewarePipeline {
  constructor(
    private readonly preWrite: IBlockPreWriteMiddleware[],
    private readonly postWrite: IBlockPostWriteMiddleware[]
  ) {}

  async runPreWrite(
    operations: BlockOperation[],
    origin: TransactionOrigin | undefined,
    context: BlockPreWriteContext
  ): Promise<BlockOperation[]> {
    let current = operations;
    for (const mw of this.preWrite) {
      current = await mw.transform(current, context);
    }
    return current;
  }

  async runPostWrite(
    operations: BlockOperation[],
    origin: TransactionOrigin | undefined,
    result: OperationResult,
    context: BlockPostWriteContext
  ): Promise<void> {
    for (const mw of this.postWrite) {
      await mw.afterApply(operations, result, context);
    }
  }
}
