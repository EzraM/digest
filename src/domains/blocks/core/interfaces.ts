/**
 * Blocks Domain - Service Interfaces
 *
 * These interfaces define the contracts for block-related services.
 * Each interface represents a distinct responsibility, allowing:
 * - Independent testing with mock implementations
 * - Swappable implementations (e.g., different storage backends)
 * - Clear dependency injection boundaries
 */

import {
  BlockOperation,
  TransactionOrigin,
  OperationResult,
  OperationRecord,
  Snapshot,
  Block,
  SearchableBlock,
  BlockSearchManifest,
} from './types';

// ============================================================================
// Core Block Operations
// ============================================================================

/**
 * Applies block operations to a document
 * This is the main entry point for modifying blocks
 */
export interface IBlockOperationApplier {
  /**
   * Apply one or more operations to a document
   */
  applyOperations(
    operations: BlockOperation[],
    origin?: TransactionOrigin
  ): Promise<OperationResult>;

  /**
   * Get current blocks array
   */
  getBlocks(): Block[];
}

/**
 * Persists operations for event sourcing
 */
export interface IOperationStore {
  /**
   * Persist an operation record
   */
  persistOperation(
    documentId: string,
    operation: BlockOperation,
    origin?: TransactionOrigin
  ): Promise<void>;

  /**
   * Replay operations from a given offset
   * Returns the number of operations replayed
   */
  replayOperations(
    documentId: string,
    options?: { offset?: number }
  ): Promise<OperationRecord[]>;

  /**
   * Get total operation count for a document
   */
  getOperationCount(documentId: string): Promise<number>;
}

/**
 * Manages document snapshots for fast reload
 */
export interface ISnapshotStore {
  /**
   * Save a snapshot
   */
  saveSnapshot(snapshot: Snapshot): Promise<void>;

  /**
   * Load the latest snapshot for a document
   */
  loadLatestSnapshot(documentId: string): Promise<Snapshot | null>;

  /**
   * Prune old snapshots beyond retention limit
   */
  pruneSnapshots(documentId: string, keepCount: number): Promise<void>;
}

/**
 * Broadcasts block updates to interested parties (e.g., renderer)
 */
export interface IBlockBroadcaster {
  /**
   * Broadcast a document update
   */
  broadcast(update: {
    blocks: Block[];
    origin?: TransactionOrigin;
    timestamp: number;
  }): void;

  /**
   * Check if broadcasting is available
   */
  isAvailable(): boolean;
}

// ============================================================================
// Block Conversion & Transformation
// ============================================================================

/**
 * Converts between BlockNote format and our operation format
 */
export interface IBlockConverter {
  /**
   * Convert BlockNote changes to block operations
   */
  convertChanges(
    changes: BlockNoteChange[],
    userId?: string,
    requestId?: string
  ): { operations: BlockOperation[]; origin: TransactionOrigin };

  /**
   * Check if a change should be processed (filters sync loops)
   */
  shouldProcess(change: BlockNoteChange): boolean;
}

/**
 * BlockNote change event (from BlockNote's onChange)
 */
export interface BlockNoteChange {
  block: Block;
  prevBlock?: Block;
  type: 'insert' | 'delete' | 'update';
  source: {
    type: 'local' | 'paste' | 'drop' | 'undo' | 'redo' | 'undo-redo' | 'yjs-remote';
  };
}

// ============================================================================
// Search & Indexing (for future workspace)
// ============================================================================

/**
 * Extracts searchable content from blocks using manifests
 */
export interface IBlockContentExtractor {
  /**
   * Extract searchable content from a block
   */
  extract(block: Block, manifest: BlockSearchManifest): SearchableBlock;

  /**
   * Get the manifest for a block type
   */
  getManifest(blockType: string): BlockSearchManifest | null;

  /**
   * Register a manifest for a block type
   */
  registerManifest(manifest: BlockSearchManifest): void;
}

/**
 * Manages the search index for blocks
 */
export interface IBlockSearchIndex {
  /**
   * Index a block for search
   */
  index(block: SearchableBlock): Promise<void>;

  /**
   * Remove a block from the index
   */
  remove(blockId: string): Promise<void>;

  /**
   * Search for blocks matching a query
   */
  search(query: string, options?: SearchOptions): Promise<SearchResult[]>;
}

export interface SearchOptions {
  readonly limit?: number;
  readonly documentId?: string;
  readonly blockTypes?: readonly string[];
}

export interface SearchResult {
  readonly blockId: string;
  readonly documentId: string;
  readonly score: number;
  readonly snippet: string;
  readonly block: Block;
}

// ============================================================================
// Document Management
// ============================================================================

/**
 * High-level document operations (coordinates other services)
 */
export interface IDocumentService {
  /**
   * Load a document, replaying operations or loading from snapshot
   */
  loadDocument(documentId: string): Promise<Block[]>;

  /**
   * Seed initial content for a new document
   */
  seedContent(documentId: string, blocks: Block[]): Promise<void>;

  /**
   * Create a snapshot of the current document state
   */
  createSnapshot(documentId: string): Promise<void>;
}
