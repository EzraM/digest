import { CustomBlock } from "./schema";

/**
 * Enhanced transaction origin metadata for Y.js transactions
 * This allows grouping operations and tracking their provenance
 */
export interface TransactionOrigin {
  source: "user" | "llm" | "sync" | "system" | "paste" | "drop" | "undo";
  requestId?: string; // For LLM requests or user actions
  batchId?: string; // For grouping related operations
  userId?: string; // For collaboration
  timestamp: number;
  metadata?: Record<string, any>; // Extensible metadata
}

/**
 * Unified block operation interface for both user and LLM edits
 */
export interface BlockOperation {
  type: "insert" | "update" | "delete" | "move";
  blockId: string;
  position?: number;
  block?: CustomBlock;
  document?: CustomBlock[]; // For document-level updates
  prevBlock?: CustomBlock; // For update operations
  parentId?: string; // For nested operations
  source: "user" | "llm" | "sync" | "system";
  timestamp?: number;
  userId?: string; // For collaboration
  // Enhanced provenance tracking
  requestId?: string; // Links back to original request
  batchId?: string; // Groups related operations
  // BlockNote changes array for tracking deletions
  changes?: Array<{
    type: "insert" | "delete" | "update" | "move";
    block: any;
    prevBlock?: any; // For updates/moves
    source?: { type: string };
  }>;
}

/**
 * Block change from BlockNote's onChange event
 * Maps to BlockNote 0.14.1's getChanges() API
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

/**
 * Enhanced document update event for Y.js synchronization
 * Now includes full transaction origin metadata
 */
export interface DocumentUpdate {
  operations: BlockOperation[];
  origin?: TransactionOrigin; // Rich transaction metadata
  ydocState?: Uint8Array; // Y.js document state for sync
}

/**
 * Batch operation for applying multiple related changes atomically
 * Uses Y.js transaction metadata for provenance tracking
 */
export interface BatchOperation {
  id: string; // batchId
  operations: BlockOperation[];
  origin: TransactionOrigin;
  createdAt: number;
}

/**
 * LLM operation request with rich metadata
 * Allows tracking from request through to applied operations
 */
export interface LLMOperationRequest {
  requestId: string;
  userId?: string;
  prompt?: string;
  context?: {
    cursorPosition?: number;
    selectedBlocks?: string[];
    nearbyBlocks?: CustomBlock[];
  };
  timestamp: number;
}

/**
 * Database persistence record
 */
export interface OperationRecord {
  id: string;
  documentId: string;
  operation: BlockOperation;
  appliedAt: number;
  checksum?: string;
  // Enhanced with transaction metadata
  batchId?: string;
  requestId?: string;
  origin?: TransactionOrigin;
}

/**
 * Result of applying operations
 */
export interface OperationResult {
  success: boolean;
  operationsApplied: number;
  errors?: string[];
  conflicts?: BlockOperation[];
  batchId?: string; // If operations were batched
}

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
  metadata?: Record<string, any>
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
 */
export function createLLMTransactionOrigin(
  requestId: string,
  userId?: string,
  batchId?: string,
  metadata?: Record<string, any>
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
