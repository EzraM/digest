/**
 * Block middleware contracts
 *
 * Pre-write: transform operations before persist + Y.doc.
 * Post-write: observe after apply (e.g. search indexing, image cleanup).
 */

import type { BlockOperation, OperationResult, TransactionOrigin } from "./types";

export interface BlockPreWriteContext {
  documentId: string;
  origin?: TransactionOrigin;
}

export interface BlockPostWriteContext {
  documentId: string;
  origin?: TransactionOrigin;
}

export interface IBlockPreWriteMiddleware {
  /**
   * Transform operations before they are persisted and applied to Y.doc.
   * Return a new array (or the same reference if no change).
   * Throwing aborts the apply.
   */
  transform(
    operations: BlockOperation[],
    context: BlockPreWriteContext
  ): BlockOperation[] | Promise<BlockOperation[]>;
}

export interface IBlockPostWriteMiddleware {
  /**
   * Called after operations have been applied (SQLite + Y.doc).
   * Do not mutate operations; document state is already updated.
   */
  afterApply(
    operations: BlockOperation[],
    result: OperationResult,
    context: BlockPostWriteContext
  ): void | Promise<void>;
}

export interface BlockMiddlewarePipeline {
  runPreWrite(
    operations: BlockOperation[],
    origin: TransactionOrigin | undefined,
    context: BlockPreWriteContext
  ): Promise<BlockOperation[]>;

  runPostWrite(
    operations: BlockOperation[],
    origin: TransactionOrigin | undefined,
    result: OperationResult,
    context: BlockPostWriteContext
  ): Promise<void>;
}
