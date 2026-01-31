/**
 * Operations Types - Compatibility Layer
 *
 * This file re-exports types from the blocks domain for backward compatibility.
 *
 * DEPRECATED: New code should import directly from:
 * - Pure types: import { BlockOperation } from '../domains/blocks/core'
 * - BlockNote types: import { BlockChange } from '../domains/blocks/adapters'
 */

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
// Re-export BlockNote-specific types from adapters
// ============================================================================

export type { BlockChange } from '../domains/blocks/adapters';
export { BLOCKNOTE_SOURCE_MAP } from '../domains/blocks/adapters';

// ============================================================================
// Helper Functions (kept here for backward compatibility)
// ============================================================================

import type { TransactionOrigin } from '../domains/blocks/core';

/**
 * Creates a transaction origin for user operations
 * @deprecated Import BlockNoteAdapter and use its methods instead
 */
export function createUserTransactionOrigin(
  userId?: string,
  requestId?: string,
  metadata?: Record<string, unknown>
): TransactionOrigin {
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
 * @deprecated Import BlockNoteAdapter and use its methods instead
 */
export function createLLMTransactionOrigin(
  requestId: string,
  userId?: string,
  batchId?: string,
  metadata?: Record<string, unknown>
): TransactionOrigin {
  return {
    source: "llm",
    requestId,
    batchId: batchId || `llm-batch-${Date.now()}`,
    userId,
    timestamp: Date.now(),
    metadata,
  };
}
