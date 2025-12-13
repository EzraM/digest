import {
  BlockOperation,
  BlockChange,
  LLMOperationRequest,
  BLOCKNOTE_SOURCE_MAP,
  createUserTransactionOrigin,
  createLLMTransactionOrigin,
  TransactionOrigin,
} from "../types/operations";
import { CustomBlock } from "../types/schema";
import { log } from "../utils/rendererLogger";

/**
 * Converts BlockNote onChange events to unified block operations
 * Enhanced with Y.js transaction origin support for provenance tracking
 */
export class BlockNoteOperationConverter {
  private static instance: BlockNoteOperationConverter;
  private batchTimeout: NodeJS.Timeout | null = null;
  private pendingOperations: BlockOperation[] = [];

  public static getInstance(): BlockNoteOperationConverter {
    if (!BlockNoteOperationConverter.instance) {
      BlockNoteOperationConverter.instance = new BlockNoteOperationConverter();
    }
    return BlockNoteOperationConverter.instance;
  }

  /**
   * Converts BlockNote changes to unified operations with enhanced provenance
   * Uses the BLOCKNOTE_SOURCE_MAP for consistent source mapping
   */
  public convertBlockNoteChanges(
    changes: BlockChange[],
    userId?: string,
    requestId?: string
  ): { operations: BlockOperation[]; origin: TransactionOrigin } {
    log.debug(
      `[BlockNoteOperationConverter] Converting ${changes.length} BlockNote changes`
    );

    const operations: BlockOperation[] = [];
    let primarySource = "user";

    for (const change of changes) {
      // Map BlockNote source to our unified source using the enhanced mapping
      const unifiedSource = BLOCKNOTE_SOURCE_MAP[change.source.type] || "user";
      if (change.source.type === "yjs-remote") {
        primarySource = "sync";
      }

      const operation: BlockOperation = {
        type: change.type,
        blockId: change.block.id || `block-${Date.now()}-${Math.random()}`,
        block: change.block,
        prevBlock: change.prevBlock,
        source: unifiedSource as "user" | "llm" | "sync" | "system",
        timestamp: Date.now(),
        userId,
        requestId,
      };

      operations.push(operation);
      log.debug(
        `[BlockNoteOperationConverter] Converted ${change.type} operation for block ${operation.blockId}`
      );
    }

    // Create appropriate transaction origin based on the primary source
    const origin =
      primarySource === "sync"
        ? { source: "sync" as const, timestamp: Date.now() }
        : createUserTransactionOrigin(userId, requestId, {
            blockNoteSource: changes[0]?.source.type,
            changeCount: changes.length,
          });

    return { operations, origin };
  }

  /**
   * @deprecated Typo kept for backward compatibility; use convertBlockNoteChanges.
   */
  public convertBlockNotChanges(
    changes: BlockChange[],
    userId?: string,
    requestId?: string
  ): { operations: BlockOperation[]; origin: TransactionOrigin } {
    return this.convertBlockNoteChanges(changes, userId, requestId);
  }

  /**
   * Creates LLM operations from an operation request
   * Enhanced with batch tracking and rich transaction metadata
   */
  public createLLMOperations(
    request: LLMOperationRequest,
    blocks: CustomBlock[]
  ): { operations: BlockOperation[]; origin: TransactionOrigin } {
    log.debug(
      `[BlockNoteOperationConverter] Creating ${blocks.length} LLM operations for request ${request.requestId}`
    );

    const batchId = `llm-batch-${request.requestId}-${Date.now()}`;
    const operations: BlockOperation[] = [];

    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      const operation: BlockOperation = {
        type: "insert",
        blockId: block.id || `llm-block-${Date.now()}-${i}`,
        position: i, // Sequential insertion
        block,
        source: "llm",
        timestamp: Date.now(),
        userId: request.userId,
        requestId: request.requestId,
        batchId,
      };

      operations.push(operation);
    }

    // Create rich transaction origin for LLM operations
    const origin = createLLMTransactionOrigin(
      request.requestId,
      request.userId,
      batchId,
      {
        prompt: request.prompt,
        context: request.context,
        blockCount: blocks.length,
      }
    );

    log.debug(
      `[BlockNoteOperationConverter] Created LLM batch ${batchId} with ${operations.length} operations`
    );
    return { operations, origin };
  }

  /**
   * Batches operations to reduce event overhead
   * Enhanced with transaction origin preservation
   */
  public batchOperations(
    operations: BlockOperation[],
    origin: TransactionOrigin,
    batchDelayMs = 50
  ): Promise<{ operations: BlockOperation[]; origin: TransactionOrigin }> {
    return new Promise((resolve) => {
      // Add to pending batch
      this.pendingOperations.push(...operations);

      // Clear existing timeout
      if (this.batchTimeout) {
        clearTimeout(this.batchTimeout);
      }

      // Set new timeout to flush batch
      this.batchTimeout = setTimeout(() => {
        const batchedOperations = [...this.pendingOperations];
        this.pendingOperations = [];
        this.batchTimeout = null;

        // Preserve original origin but update batch info
        const batchedOrigin: TransactionOrigin = {
          ...origin,
          batchId: origin.batchId || `batch-${Date.now()}`,
          metadata: {
            ...origin.metadata,
            batchSize: batchedOperations.length,
            batchedAt: Date.now(),
          },
        };

        log.debug(
          `[BlockNoteOperationConverter] Flushing batch of ${batchedOperations.length} operations`
        );
        resolve({ operations: batchedOperations, origin: batchedOrigin });
      }, batchDelayMs);
    });
  }

  /**
   * Filters out operations that shouldn't trigger main process updates
   * Enhanced to use the new source mapping system
   */
  public shouldProcessChange(change: BlockChange): boolean {
    // Process local user changes, but not remote Y.js changes to avoid loops
    const shouldProcess = change.source.type !== "yjs-remote";

    if (!shouldProcess) {
      log.debug(
        `[BlockNoteOperationConverter] Skipping ${change.source.type} change to avoid loops`
      );
    }

    return shouldProcess;
  }

  /**
   * Gets a human-readable description of the operation source
   */
  public getSourceDescription(source: string): string {
    const descriptions = {
      local: "Direct user edit",
      paste: "Paste operation",
      drop: "Drag & drop",
      undo: "Undo action",
      redo: "Redo action",
      "undo-redo": "Undo/redo batch",
      "yjs-remote": "Remote sync",
    };

    return descriptions[source as keyof typeof descriptions] || source;
  }
}
