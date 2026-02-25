/**
 * SearchIndexManager
 *
 * Main process service that manages the search index lifecycle:
 * - Initializes vector store and embedding provider (or FTS5)
 * - Subscribes to block changes and indexes them
 * - Provides bootstrap indexing for existing documents
 *
 * This is the integration point between the block system and search.
 */

import Database from "better-sqlite3";
import { SqliteVectorStore, type VectorStoreConfig } from "./SqliteVectorStore";
import {
  createEmbeddingProvider,
  MockEmbeddingProvider,
  type EmbeddingProviderType,
} from "./EmbeddingProvider";
import { SearchIndexService } from "./SearchIndexService";
import { Fts5SearchService } from "./Fts5SearchService";
import type {
  IEmbeddingProvider,
  ISearchIndexService,
  IndexEvent,
  RetrievalContext,
  RetrievedNote,
} from "../core/types";
import type { Block } from "../../blocks/core/types";
import type { BlockOperation } from "../../blocks/core";
import { extractTextFromBlock } from "../core/textExtractor";
import { log } from "../../../utils/mainLogger";

/**
 * Search provider type - either embedding-based or FTS5
 */
export type SearchProviderType = EmbeddingProviderType | "fts5";

/**
 * Configuration for SearchIndexManager
 */
export interface SearchIndexManagerConfig {
  /** Search provider type */
  searchProvider: SearchProviderType;
  /** API key for cloud embedding providers (not needed for fts5 or mock) */
  apiKey?: string;
  /** Custom embedding model name */
  model?: string;
  /** Dimensions for mock provider (default 384) */
  mockDimensions?: number;
}

/**
 * Singleton manager for search indexing in the main process
 */
export class SearchIndexManager {
  private static instance: SearchIndexManager | null = null;

  private db: Database.Database;
  private vectorStore: SqliteVectorStore | null = null;
  private embeddingProvider: IEmbeddingProvider | null = null;
  private searchService: ISearchIndexService;
  private initialized = false;
  private providerType: SearchProviderType;

  private constructor(db: Database.Database, config: SearchIndexManagerConfig) {
    this.db = db;
    this.providerType = config.searchProvider;

    if (config.searchProvider === "fts5") {
      // Use FTS5 full-text search
      this.searchService = new Fts5SearchService(db);
      log.debug(
        "SearchIndexManager created with FTS5 provider",
        "SearchIndexManager"
      );
    } else {
      // Use embedding-based search
      if (config.searchProvider === "mock") {
        this.embeddingProvider = new MockEmbeddingProvider(
          config.mockDimensions ?? 384
        );
      } else {
        if (!config.apiKey) {
          log.debug(
            `No API key for ${config.searchProvider}, falling back to mock provider`,
            "SearchIndexManager"
          );
          this.embeddingProvider = new MockEmbeddingProvider(384);
        } else {
          this.embeddingProvider = createEmbeddingProvider({
            type: config.searchProvider,
            apiKey: config.apiKey,
            model: config.model,
          });
        }
      }

      // Create vector store
      const vectorConfig: VectorStoreConfig = {
        dimensions: this.embeddingProvider.dimensions,
        modelName: this.embeddingProvider.providerName,
      };
      this.vectorStore = new SqliteVectorStore(db, vectorConfig);

      // Create search service
      this.searchService = new SearchIndexService(
        this.embeddingProvider,
        this.vectorStore
      );

      log.debug(
        `SearchIndexManager created with ${this.embeddingProvider.providerName} provider (${this.embeddingProvider.dimensions} dimensions)`,
        "SearchIndexManager"
      );
    }
  }

  /**
   * Get singleton instance
   */
  static getInstance(): SearchIndexManager | null {
    return SearchIndexManager.instance;
  }

  /**
   * Initialize the search index manager
   */
  static async initialize(
    db: Database.Database,
    config: SearchIndexManagerConfig
  ): Promise<SearchIndexManager> {
    if (SearchIndexManager.instance) {
      return SearchIndexManager.instance;
    }

    const manager = new SearchIndexManager(db, config);
    await manager.init();
    SearchIndexManager.instance = manager;

    return manager;
  }

  /**
   * Internal initialization
   */
  private async init(): Promise<void> {
    if (this.initialized) return;

    // Initialize vector store if using embedding-based search
    if (this.vectorStore) {
      await this.vectorStore.initialize();
    }

    // Subscribe to search service events
    this.searchService.events$.subscribe((event: IndexEvent) => {
      switch (event.type) {
        case "indexing_complete":
          log.debug(
            `Indexing complete: ${event.indexed} blocks in ${event.duration}ms`,
            "SearchIndexManager"
          );
          break;
        case "error":
          log.debug(`Search index error: ${event.error}`, "SearchIndexManager");
          break;
      }
    });

    this.initialized = true;
    log.debug("SearchIndexManager initialized", "SearchIndexManager");
  }

  /**
   * Index a single block (called when blocks change)
   */
  async indexBlock(block: Block, documentId: string): Promise<void> {
    this.ensureInitialized();
    // If the block has no searchable content (e.g. link URL cleared), remove from index
    // so it doesn't appear in results; we only get updates here, not block deletes.
    const text = extractTextFromBlock(block).trim();
    if (!text) {
      await this.removeBlock(block.id);
      return;
    }
    await this.searchService.indexBlock(block, documentId);
  }

  /**
   * Queue a block for indexing (debounced)
   */
  queueBlock(block: Block, documentId: string): void {
    this.ensureInitialized();
    this.searchService.queueBlock(block, documentId);
  }

  /**
   * Remove a block from the index
   */
  async removeBlock(blockId: string): Promise<void> {
    this.ensureInitialized();
    await this.searchService.removeBlock(blockId);
  }

  /**
   * Reindex an entire document
   */
  async reindexDocument(documentId: string, blocks: Block[]): Promise<void> {
    this.ensureInitialized();
    await this.searchService.reindexDocument(documentId, blocks);
  }

  /**
   * Search for blocks matching a query
   */
  async search(
    query: string,
    context?: RetrievalContext,
    limit?: number
  ): Promise<RetrievedNote[]> {
    this.ensureInitialized();
    return this.searchService.search(query, context, limit);
  }

  /**
   * React to applied block operations (for post-write middleware).
   * Indexes insert/update blocks and removes deleted blocks from the search index.
   */
  async indexOperations(
    operations: BlockOperation[],
    documentId: string
  ): Promise<void> {
    this.ensureInitialized();

    for (const op of operations) {
      try {
        const changes = (
          op as BlockOperation & {
            changes?: Array<{ type: string; block?: Block }>;
          }
        ).changes;
        if (changes?.length) {
          for (const change of changes) {
            if (change.type === "delete" && change.block?.id) {
              log.info(
                `Search index: delete via changes, blockId=${change.block.id}`,
                "SearchIndexManager"
              );
              await this.removeBlock(change.block.id);
            } else if (
              (change.type === "insert" || change.type === "update") &&
              change.block
            ) {
              await this.indexBlock(change.block, documentId);
            }
          }
        } else {
          if (op.type === "delete") {
            log.info(
              `Search index: delete via op, blockId=${op.blockId}`,
              "SearchIndexManager"
            );
            await this.removeBlock(op.blockId);
          } else if (
            (op.type === "insert" || op.type === "update") &&
            op.block
          ) {
            await this.indexBlock(op.block, documentId);
          }
        }
      } catch (error) {
        log.debug(
          `Search index: failed to process operation ${op.blockId}: ${error}`,
          "SearchIndexManager"
        );
      }
    }
  }

  /**
   * Get index statistics
   */
  async getStats(): Promise<{ indexedBlocks: number; lastIndexedAt?: number }> {
    this.ensureInitialized();
    return this.searchService.getStats();
  }

  /**
   * Bootstrap index for existing documents
   * Call this on app startup to index any unindexed blocks
   */
  async bootstrapIndex(
    getDocumentBlocks: (documentId: string) => Promise<Block[]>,
    documentIds: string[]
  ): Promise<void> {
    this.ensureInitialized();

    log.debug(
      `Bootstrapping index for ${documentIds.length} documents`,
      "SearchIndexManager"
    );

    for (const documentId of documentIds) {
      try {
        const blocks = await getDocumentBlocks(documentId);
        if (blocks.length > 0) {
          await this.searchService.reindexDocument(documentId, blocks);
        }
      } catch (error) {
        log.debug(
          `Failed to bootstrap document ${documentId}: ${error}`,
          "SearchIndexManager"
        );
      }
    }
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    this.searchService.dispose();
    SearchIndexManager.instance = null;
    log.debug("SearchIndexManager disposed", "SearchIndexManager");
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error(
        "SearchIndexManager not initialized. Call initialize() first."
      );
    }
  }
}
