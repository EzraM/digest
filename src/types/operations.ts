/**
 * Operations Types - BlockNote Integration Layer
 *
 * This file re-exports pure domain types from domains/blocks/core
 * and adds BlockNote-specific extensions.
 *
 * Over time, imports should migrate to use domains/blocks/core directly.
 */

import { CustomBlock } from "./schema";

// ============================================================================
// Re-export pure domain types from core
// ============================================================================

export type {
  OperationSource,
  TransactionSource,
  BlockOperation,
  TransactionOrigin,
  OperationResult,
  Block,
  OperationRecord,
  Snapshot,
  DocumentUpdate,
  BatchOperation,
  LLMOperationRequest,
  BlockSearchManifest,
  SearchableField,
  SearchableBlock,
} from '../domains/blocks/core';

// ============================================================================
// BlockNote-specific types (not in pure core)
// ============================================================================

/**
 * Block change from BlockNote's onChange event
 * Maps to BlockNote 0.14.1's getChanges() API
 * This is BlockNote-specific and uses CustomBlock
 */
export interface BlockChange {
  block: CustomBlock;
  source: {
    type:
      | "local"
      | "paste"
      | "drop"
      | "undo"
      | "redo"
      | "undo-redo"
      | "yjs-remote";
  };
  type: "insert" | "delete" | "update";
  prevBlock?: CustomBlock;
}

// ============================================================================
// BlockNote Integration Utilities
// ============================================================================

/**
 * Maps BlockNote source types to our unified source types
 */
export const BLOCKNOTE_SOURCE_MAP = {
  local: "user",
  paste: "user",
  drop: "user",
  undo: "user",
  redo: "user",
  "undo-redo": "user",
  "yjs-remote": "sync",
} as const;

/**
 * Creates a transaction origin for user operations
 */
export function createUserTransactionOrigin(
  userId?: string,
  requestId?: string,
  metadata?: Record<string, unknown>
): import('../domains/blocks/core').TransactionOrigin {
  return {
    source: "user",
    userId,
    requestId,
    timestamp: Date.now(),
    metadata,
  };
}

/**
 * Creates a transaction origin for LLM operations
 */
export function createLLMTransactionOrigin(
  requestId: string,
  userId?: string,
  batchId?: string,
  metadata?: Record<string, unknown>
): import('../domains/blocks/core').TransactionOrigin {
  return {
    source: "llm",
    requestId,
    batchId: batchId || `llm-batch-${Date.now()}`,
    userId,
    timestamp: Date.now(),
    metadata,
  };
}
