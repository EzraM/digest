/**
 * SearchIndexService
 *
 * Coordinates embedding generation and vector storage.
 * Main entry point for indexing blocks and searching.
 */

import type {
  ISearchIndexService,
  IEmbeddingProvider,
  IVectorStore,
  RetrievalContext,
  RetrievedNote,
  SearchIndexConfig,
  IndexEvent,
  VectorMetadata,
} from "../core/types";
import type { Block } from "../../blocks/core/types";
import { extractTextFromBlock, toSearchableBlock } from "../core/textExtractor";
import { log } from "../../../utils/mainLogger";
import { Subject, Observable } from "rxjs";

/**
 * Default configuration
 */
const DEFAULT_CONFIG: Required<SearchIndexConfig> = {
  batchSize: 10,
  debounceMs: 500,
  minContentLength: 3,
};

/**
 * Main search index service
 */
export class SearchIndexService implements ISearchIndexService {
  private embeddingProvider: IEmbeddingProvider;
  private vectorStore: IVectorStore;
  private config: Required<SearchIndexConfig>;

  // Event stream for index updates
  private eventSubject = new Subject<IndexEvent>();
  public readonly events$: Observable<IndexEvent> = this.eventSubject.asObservable();

  // Pending indexing queue
  private pendingBlocks: Map<string, { block: Block; documentId: string }> = new Map();
  private debounceTimer: NodeJS.Timeout | null = null;
  private isIndexing = false;

  constructor(
    embeddingProvider: IEmbeddingProvider,
    vectorStore: IVectorStore,
    config?: SearchIndexConfig
  ) {
    this.embeddingProvider = embeddingProvider;
    this.vectorStore = vectorStore;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Index a single block
   */
  async indexBlock(block: Block, documentId: string): Promise<void> {
    const text = extractTextFromBlock(block);

    // Skip blocks with insufficient content
    if (!text || text.length < this.config.minContentLength) {
      log.debug(
        `Skipping block ${block.id} - insufficient content`,
        "SearchIndexService"
      );
      return;
    }

    try {
      // Generate embedding
      const embedding = await this.embeddingProvider.embed(text);

      // Store in vector store
      const metadata: VectorMetadata = {
        blockId: block.id,
        documentId,
        blockType: block.type,
        textPreview: text.slice(0, 200),
        updatedAt: Date.now(),
      };

      await this.vectorStore.upsert(block.id, embedding, metadata);

      this.eventSubject.next({ type: "block_indexed", blockId: block.id });
      log.debug(`Indexed block ${block.id}`, "SearchIndexService");
    } catch (error) {
      this.eventSubject.next({
        type: "error",
        error: `Failed to index block ${block.id}: ${error}`,
      });
      throw error;
    }
  }

  /**
   * Queue a block for indexing (debounced)
   */
  queueBlock(block: Block, documentId: string): void {
    this.pendingBlocks.set(block.id, { block, documentId });

    // Reset debounce timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.flushQueue();
    }, this.config.debounceMs);
  }

  /**
   * Flush the pending queue and index all blocks
   */
  private async flushQueue(): Promise<void> {
    if (this.isIndexing || this.pendingBlocks.size === 0) return;

    this.isIndexing = true;
    const blocks = Array.from(this.pendingBlocks.values());
    this.pendingBlocks.clear();

    log.debug(
      `Flushing queue: ${blocks.length} blocks to index`,
      "SearchIndexService"
    );

    try {
      await this.indexBlocksBatched(blocks);
    } finally {
      this.isIndexing = false;
    }
  }

  /**
   * Index multiple blocks in batches
   */
  private async indexBlocksBatched(
    items: Array<{ block: Block; documentId: string }>
  ): Promise<void> {
    const startTime = Date.now();
    let indexed = 0;

    this.eventSubject.next({ type: "indexing_started", count: items.length });

    // Filter to blocks with sufficient content
    const toIndex = items.filter(({ block }) => {
      const text = extractTextFromBlock(block);
      return text && text.length >= this.config.minContentLength;
    });

    // Process in batches
    for (let i = 0; i < toIndex.length; i += this.config.batchSize) {
      const batch = toIndex.slice(i, i + this.config.batchSize);

      // Extract texts for batch embedding
      const texts = batch.map(({ block }) => extractTextFromBlock(block));

      try {
        // Batch embed
        const embeddings = await this.embeddingProvider.batchEmbed(texts);

        // Store each embedding
        for (let j = 0; j < batch.length; j++) {
          const { block, documentId } = batch[j];
          const metadata: VectorMetadata = {
            blockId: block.id,
            documentId,
            blockType: block.type,
            textPreview: texts[j].slice(0, 200),
            updatedAt: Date.now(),
          };

          await this.vectorStore.upsert(block.id, embeddings[j], metadata);
          indexed++;

          this.eventSubject.next({
            type: "indexing_progress",
            indexed,
            total: toIndex.length,
          });
        }
      } catch (error) {
        this.eventSubject.next({
          type: "error",
          error: `Batch indexing failed: ${error}`,
        });
        // Continue with next batch
      }
    }

    const duration = Date.now() - startTime;
    this.eventSubject.next({ type: "indexing_complete", indexed, duration });
    log.debug(
      `Indexing complete: ${indexed} blocks in ${duration}ms`,
      "SearchIndexService"
    );
  }

  /**
   * Remove a block from the index
   */
  async removeBlock(blockId: string): Promise<void> {
    await this.vectorStore.delete(blockId);
    this.eventSubject.next({ type: "block_removed", blockId });
    log.debug(`Removed block ${blockId} from index`, "SearchIndexService");
  }

  /**
   * Reindex all blocks for a document
   */
  async reindexDocument(documentId: string, blocks: Block[]): Promise<void> {
    log.debug(
      `Reindexing document ${documentId} with ${blocks.length} blocks`,
      "SearchIndexService"
    );

    // Remove existing vectors for this document
    await this.vectorStore.deleteByDocument(documentId);

    // Flatten nested blocks
    const flatBlocks: Array<{ block: Block; documentId: string }> = [];

    function collectBlocks(block: Block): void {
      flatBlocks.push({ block, documentId });
      if (block.children && Array.isArray(block.children)) {
        for (const child of block.children) {
          collectBlocks(child as Block);
        }
      }
    }

    for (const block of blocks) {
      collectBlocks(block);
    }

    // Index all blocks
    await this.indexBlocksBatched(flatBlocks);
  }

  /**
   * Search for blocks matching a query
   */
  async search(
    query: string,
    context?: RetrievalContext,
    limit = 10
  ): Promise<RetrievedNote[]> {
    if (!query || query.length < this.config.minContentLength) {
      return [];
    }

    try {
      // Generate query embedding
      const queryEmbedding = await this.embeddingProvider.embed(query);

      // Search vector store
      const results = await this.vectorStore.search(
        queryEmbedding,
        limit + (context?.excludeBlockIds?.length ?? 0)
      );

      // Filter and transform results
      let notes: RetrievedNote[] = results
        .filter((r) => {
          // Apply minimum score filter
          if (context?.minScore && r.score < context.minScore) {
            return false;
          }
          // Exclude specified blocks
          if (context?.excludeBlockIds?.includes(r.metadata.blockId)) {
            return false;
          }
          return true;
        })
        .map((r) => ({
          blockId: r.metadata.blockId,
          documentId: r.metadata.documentId,
          blockType: r.metadata.blockType,
          content: r.metadata.textPreview,
          score: r.score,
          metadata: {
            updatedAt: r.metadata.updatedAt,
          },
        }));

      // Boost results from current document
      if (context?.documentId) {
        notes = notes.map((note) => ({
          ...note,
          score:
            note.documentId === context.documentId
              ? note.score * 1.1 // 10% boost for same document
              : note.score,
        }));

        // Re-sort after boosting
        notes.sort((a, b) => b.score - a.score);
      }

      return notes.slice(0, limit);
    } catch (error) {
      log.debug(`Search failed: ${error}`, "SearchIndexService");
      throw error;
    }
  }

  /**
   * Get index statistics
   */
  async getStats(): Promise<{ indexedBlocks: number; lastIndexedAt?: number }> {
    const count = await this.vectorStore.count();
    return {
      indexedBlocks: count,
      // Could track last indexed time in metadata table if needed
    };
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.eventSubject.complete();
  }
}
