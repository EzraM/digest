/**
 * Blocks Domain - Pure Core Types
 *
 * This module defines the core data types for block operations.
 * Following the "Functional Core, Imperative Shell" pattern:
 * - All types are plain data (no methods, no side effects)
 * - These types flow through the system unchanged
 * - Implementations live in services/ and adapt to these contracts
 */

/**
 * The source of a block operation - who/what initiated it
 */
export type OperationSource =
  | 'user'      // Direct user action in editor
  | 'llm'       // AI-generated content
  | 'sync'      // Remote sync (Y.js)
  | 'system'    // System-initiated (migrations, seeding)
  | 'clip';     // Web clipper

/**
 * Extended source types for transaction origin tracking
 */
export type TransactionSource =
  | OperationSource
  | 'paste'     // Paste operation
  | 'drop'      // Drag & drop
  | 'undo';     // Undo/redo

/**
 * A block operation - the fundamental unit of change
 */
export interface BlockOperation {
  readonly type: 'insert' | 'update' | 'delete' | 'move';
  readonly blockId: string;
  readonly source: OperationSource;
  readonly timestamp?: number;

  // For insert/update
  readonly block?: Block;
  readonly position?: number;
  readonly afterBlockId?: string;

  // For update (previous state for diffing/undo)
  readonly prevBlock?: Block;

  // For document-level updates
  readonly document?: Block[];

  // Provenance tracking
  readonly userId?: string;
  readonly requestId?: string;
  readonly batchId?: string;
}

/**
 * Transaction origin - metadata about a group of operations
 */
export interface TransactionOrigin {
  readonly source: TransactionSource;
  readonly timestamp: number;
  readonly requestId?: string;
  readonly batchId?: string;
  readonly userId?: string;
  readonly metadata?: Record<string, unknown>;
}

/**
 * Result of applying operations
 */
export interface OperationResult {
  readonly success: boolean;
  readonly operationsApplied: number;
  readonly errors?: readonly string[];
  readonly conflicts?: readonly BlockOperation[];
  readonly batchId?: string;
}

/**
 * A block - the fundamental content unit
 * This is a simplified representation; actual BlockNote blocks have more fields
 */
export interface Block {
  readonly id: string;
  readonly type: string;
  readonly props?: Record<string, unknown>;
  readonly content?: unknown;
  readonly children?: readonly Block[];
}

/**
 * Persisted operation record (for event sourcing)
 */
export interface OperationRecord {
  readonly id: string;
  readonly documentId: string;
  readonly operation: BlockOperation;
  readonly appliedAt: number;
  readonly checksum?: string;
  readonly batchId?: string;
  readonly requestId?: string;
  readonly origin?: TransactionOrigin;
}

/**
 * Document snapshot for fast reload
 */
export interface Snapshot {
  readonly id: string;
  readonly documentId: string;
  readonly data: Uint8Array;
  readonly createdAt: number;
  readonly operationCount: number;
}

// ============================================================================
// Search & Embedding Types (for future workspace integration)
// ============================================================================

/**
 * Declares which parts of a block type are searchable
 * This is the contract between block definitions and the search system
 */
export interface BlockSearchManifest {
  readonly blockType: string;
  readonly searchableFields: readonly SearchableField[];
  readonly searchWeight?: number;
  readonly excludeFromSearch?: readonly string[];
}

/**
 * A field within a block that should be indexed for search
 */
export interface SearchableField {
  readonly path: string;           // e.g., "props.url", "content", "children[].content"
  readonly fieldType: 'text' | 'url' | 'metadata';
  readonly weight: number;         // Relevance boost (1.0 = normal)
}

/**
 * Extracted searchable content from a block
 */
export interface SearchableBlock {
  readonly blockId: string;
  readonly documentId: string;
  readonly blockType: string;
  readonly textContent: string;
  readonly metadata: Record<string, unknown>;
  readonly updatedAt: number;
}
