/**
 * Search Domain - Core Types
 *
 * Following the "Functional Core, Imperative Shell" pattern:
 * - All types are plain data (no methods, no side effects)
 * - These types flow through the system unchanged
 * - Implementations live in services/
 */

// Re-export block search types from blocks domain
export type {
  BlockSearchManifest,
  SearchableField,
  SearchableBlock,
} from '../../blocks/core/types';

// ============================================================================
// Embedding Provider Contract
// ============================================================================

/**
 * Provider for generating embedding vectors from text
 * Pluggable: can swap between OpenAI, Anthropic, local models, etc.
 */
export interface IEmbeddingProvider {
  /** Generate embedding vector for a single text */
  embed(text: string): Promise<number[]>;

  /** Generate embeddings for multiple texts (more efficient) */
  batchEmbed(texts: string[]): Promise<number[][]>;

  /** Dimensionality of the embedding vectors */
  readonly dimensions: number;

  /** Provider name for logging/debugging */
  readonly providerName: string;
}

// ============================================================================
// Vector Store Contract
// ============================================================================

/**
 * Metadata stored alongside each vector
 */
export interface VectorMetadata {
  readonly blockId: string;
  readonly documentId: string;
  readonly blockType: string;
  readonly textPreview: string;
  readonly updatedAt: number;
}

/**
 * A search result from the vector store
 */
export interface VectorSearchResult {
  readonly id: string;
  readonly score: number;  // Similarity score (higher = more similar)
  readonly metadata: VectorMetadata;
}

/**
 * Vector storage and similarity search
 * Pluggable: can swap between SQLite, in-memory, external services
 */
export interface IVectorStore {
  /** Insert or update a vector */
  upsert(id: string, vector: number[], metadata: VectorMetadata): Promise<void>;

  /** Find similar vectors */
  search(queryVector: number[], limit: number): Promise<VectorSearchResult[]>;

  /** Remove a vector */
  delete(id: string): Promise<void>;

  /** Remove all vectors for a document */
  deleteByDocument(documentId: string): Promise<void>;

  /** Get count of indexed vectors */
  count(): Promise<number>;
}

// ============================================================================
// Retrieval Contract
// ============================================================================

/**
 * Context for retrieval operations
 */
export interface RetrievalContext {
  readonly documentId?: string;      // Current document (for boosting)
  readonly excludeBlockIds?: string[]; // Blocks to exclude from results
  readonly minScore?: number;         // Minimum similarity threshold
}

/**
 * A retrieved note/block from the search index
 */
export interface RetrievedNote {
  readonly blockId: string;
  readonly documentId: string;
  readonly blockType: string;
  readonly content: string;
  readonly score: number;
  readonly metadata: Record<string, unknown>;
}

/**
 * Note retrieval service
 */
export interface INoteRetriever {
  retrieve(query: string, context?: RetrievalContext, limit?: number): Promise<RetrievedNote[]>;
}

// ============================================================================
// Search Index Service Contract
// ============================================================================

/**
 * Configuration for the search index
 */
export interface SearchIndexConfig {
  readonly batchSize?: number;       // Number of blocks to index in one batch
  readonly debounceMs?: number;      // Debounce time for reindexing
  readonly minContentLength?: number; // Minimum text length to index
}

/**
 * Event emitted when index state changes
 */
export type IndexEvent =
  | { type: 'indexing_started'; count: number }
  | { type: 'indexing_progress'; indexed: number; total: number }
  | { type: 'indexing_complete'; indexed: number; duration: number }
  | { type: 'block_indexed'; blockId: string }
  | { type: 'block_removed'; blockId: string }
  | { type: 'error'; error: string };

/**
 * Main search index service - coordinates embedding and storage
 */
export interface ISearchIndexService {
  /** Index a single block */
  indexBlock(block: import('../../blocks/core/types').Block, documentId: string): Promise<void>;

  /** Remove a block from the index */
  removeBlock(blockId: string): Promise<void>;

  /** Reindex all blocks for a document */
  reindexDocument(documentId: string, blocks: import('../../blocks/core/types').Block[]): Promise<void>;

  /** Search for blocks matching a query */
  search(query: string, context?: RetrievalContext, limit?: number): Promise<RetrievedNote[]>;

  /** Get index statistics */
  getStats(): Promise<{ indexedBlocks: number; lastIndexedAt?: number }>;
}
