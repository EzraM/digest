/**
 * FTS5SearchService
 *
 * Full-text search using SQLite FTS5 extension.
 * Provides meaningful search results without requiring external APIs.
 */

import Database from "better-sqlite3";
import type {
  ISearchIndexService,
  RetrievalContext,
  RetrievedNote,
  SearchIndexConfig,
  IndexEvent,
} from "../core/types";
import type { Block } from "../../blocks/core/types";
import { extractTextFromBlock } from "../core/textExtractor";
import { log } from "../../../utils/mainLogger";
import { Subject, Observable } from "rxjs";

/**
 * Default configuration
 */
const DEFAULT_CONFIG: Required<SearchIndexConfig> = {
  batchSize: 50,
  debounceMs: 500,
  minContentLength: 3,
};

/**
 * FTS5-based search service
 */
export class Fts5SearchService implements ISearchIndexService {
  private db: Database.Database;
  private config: Required<SearchIndexConfig>;

  // Event stream for index updates
  private eventSubject = new Subject<IndexEvent>();
  public readonly events$: Observable<IndexEvent> = this.eventSubject.asObservable();

  // Pending indexing queue
  private pendingBlocks: Map<string, { block: Block; documentId: string }> = new Map();
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private isIndexing = false;

  constructor(db: Database.Database, config?: SearchIndexConfig) {
    this.db = db;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.initializeFts5Table();
  }

  /**
   * Initialize FTS5 virtual table
   */
  private initializeFts5Table(): void {
    // Create FTS5 virtual table if it doesn't exist
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS search_fts5 USING fts5(
        block_id UNINDEXED,
        document_id UNINDEXED,
        block_type UNINDEXED,
        content,
        updated_at UNINDEXED,
        tokenize='porter unicode61'
      );
    `);

    // Content-tracking table (name must not end in _content/_segments/_segdir/_docsize/_stat - reserved by FTS5)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS search_fts5_blocks (
        block_id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        block_type TEXT NOT NULL,
        text_preview TEXT,
        updated_at INTEGER NOT NULL
      );
    `);

    // Create index for document lookups
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_search_fts5_blocks_document
      ON search_fts5_blocks(document_id);
    `);

    log.debug("FTS5 search tables initialized", "Fts5SearchService");
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
        "Fts5SearchService"
      );
      return;
    }

    try {
      const now = Date.now();
      const textPreview = text.slice(0, 200);

      // Use a transaction for consistency
      this.db.transaction(() => {
        // Remove existing entry if present
        this.db
          .prepare("DELETE FROM search_fts5 WHERE block_id = ?")
          .run(block.id);
        this.db
          .prepare("DELETE FROM search_fts5_blocks WHERE block_id = ?")
          .run(block.id);

        // Insert into FTS5 table
        this.db
          .prepare(
            `INSERT INTO search_fts5 (block_id, document_id, block_type, content, updated_at)
             VALUES (?, ?, ?, ?, ?)`
          )
          .run(block.id, documentId, block.type, text, now);

        // Insert into content tracking table
        this.db
          .prepare(
            `INSERT INTO search_fts5_blocks (block_id, document_id, block_type, text_preview, updated_at)
             VALUES (?, ?, ?, ?, ?)`
          )
          .run(block.id, documentId, block.type, textPreview, now);
      })();

      this.eventSubject.next({ type: "block_indexed", blockId: block.id });
      log.debug(`Indexed block ${block.id}`, "Fts5SearchService");
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
      "Fts5SearchService"
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

    // Prepare statements for batch insert
    const deleteFromFts = this.db.prepare(
      "DELETE FROM search_fts5 WHERE block_id = ?"
    );
    const deleteFromContent = this.db.prepare(
      "DELETE FROM search_fts5_blocks WHERE block_id = ?"
    );
    const insertFts = this.db.prepare(
      `INSERT INTO search_fts5 (block_id, document_id, block_type, content, updated_at)
       VALUES (?, ?, ?, ?, ?)`
    );
    const insertContent = this.db.prepare(
      `INSERT INTO search_fts5_blocks (block_id, document_id, block_type, text_preview, updated_at)
       VALUES (?, ?, ?, ?, ?)`
    );

    // Process in batches within transactions
    for (let i = 0; i < toIndex.length; i += this.config.batchSize) {
      const batch = toIndex.slice(i, i + this.config.batchSize);

      try {
        this.db.transaction(() => {
          for (const { block, documentId } of batch) {
            const text = extractTextFromBlock(block);
            const now = Date.now();
            const textPreview = text.slice(0, 200);

            // Remove existing entries
            deleteFromFts.run(block.id);
            deleteFromContent.run(block.id);

            // Insert new entries
            insertFts.run(block.id, documentId, block.type, text, now);
            insertContent.run(block.id, documentId, block.type, textPreview, now);

            indexed++;
          }
        })();

        this.eventSubject.next({
          type: "indexing_progress",
          indexed,
          total: toIndex.length,
        });
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
      "Fts5SearchService"
    );
  }

  /**
   * Remove a block from the index
   */
  async removeBlock(blockId: string): Promise<void> {
    this.db.transaction(() => {
      this.db
        .prepare("DELETE FROM search_fts5 WHERE block_id = ?")
        .run(blockId);
      this.db
        .prepare("DELETE FROM search_fts5_blocks WHERE block_id = ?")
        .run(blockId);
    })();

    this.eventSubject.next({ type: "block_removed", blockId });
    log.debug(`Removed block ${blockId} from index`, "Fts5SearchService");
  }

  /**
   * Reindex all blocks for a document
   */
  async reindexDocument(documentId: string, blocks: Block[]): Promise<void> {
    log.debug(
      `Reindexing document ${documentId} with ${blocks.length} blocks`,
      "Fts5SearchService"
    );

    // Remove existing entries for this document
    this.db.transaction(() => {
      this.db
        .prepare("DELETE FROM search_fts5 WHERE document_id = ?")
        .run(documentId);
      this.db
        .prepare("DELETE FROM search_fts5_blocks WHERE document_id = ?")
        .run(documentId);
    })();

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
      // Prepare FTS5 query - escape special characters and add prefix matching
      const ftsQuery = this.prepareFtsQuery(query);

      // Build the search query
      let sql = `
        SELECT
          f.block_id,
          f.document_id,
          f.block_type,
          c.text_preview,
          c.updated_at,
          bm25(search_fts5) as rank
        FROM search_fts5 f
        JOIN search_fts5_blocks c ON f.block_id = c.block_id
        WHERE search_fts5 MATCH ?
      `;

      const params: (string | number)[] = [ftsQuery];

      // Exclude specified blocks
      if (context?.excludeBlockIds && context.excludeBlockIds.length > 0) {
        const placeholders = context.excludeBlockIds.map(() => "?").join(", ");
        sql += ` AND f.block_id NOT IN (${placeholders})`;
        params.push(...context.excludeBlockIds);
      }

      sql += ` ORDER BY rank LIMIT ?`;
      params.push(limit);

      const rows = this.db.prepare(sql).all(...params) as Array<{
        block_id: string;
        document_id: string;
        block_type: string;
        text_preview: string;
        updated_at: number;
        rank: number;
      }>;

      // Transform to RetrievedNote format
      let notes: RetrievedNote[] = rows.map((row) => ({
        blockId: row.block_id,
        documentId: row.document_id,
        blockType: row.block_type,
        content: row.text_preview,
        // Convert BM25 rank to a 0-1 score (BM25 returns negative values, closer to 0 is better)
        score: this.normalizeScore(row.rank),
        metadata: {
          updatedAt: row.updated_at,
        },
      }));

      // Apply minimum score filter
      if (context?.minScore) {
        notes = notes.filter((note) => note.score >= context.minScore!);
      }

      // Boost results from current document
      if (context?.documentId) {
        notes = notes.map((note) => ({
          ...note,
          score:
            note.documentId === context.documentId
              ? Math.min(note.score * 1.1, 1.0) // 10% boost, capped at 1.0
              : note.score,
        }));

        // Re-sort after boosting
        notes.sort((a, b) => b.score - a.score);
      }

      return notes.slice(0, limit);
    } catch (error) {
      log.debug(`Search failed: ${error}`, "Fts5SearchService");
      // Return empty results on FTS5 syntax errors
      if (String(error).includes("fts5")) {
        return [];
      }
      throw error;
    }
  }

  /**
   * Prepare a query string for FTS5
   * Handles special characters and adds prefix matching
   */
  private prepareFtsQuery(query: string): string {
    // Remove FTS5 special characters that could cause syntax errors
    const cleaned = query
      .replace(/['"(){}[\]^~*:]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (!cleaned) return '""';

    // Split into tokens and add prefix matching for partial word search
    const tokens = cleaned.split(" ").filter((t) => t.length > 0);

    // Use prefix matching for the last token (user is still typing)
    // and exact matching for previous tokens
    if (tokens.length === 1) {
      return `"${tokens[0]}"*`;
    }

    const exactTokens = tokens.slice(0, -1).map((t) => `"${t}"`);
    const prefixToken = `"${tokens[tokens.length - 1]}"*`;

    return [...exactTokens, prefixToken].join(" ");
  }

  /**
   * Normalize BM25 score to 0-1 range
   * BM25 returns negative values where closer to 0 is more relevant
   */
  private normalizeScore(bm25Rank: number): number {
    // BM25 scores are typically negative, closer to 0 is better
    // Convert to positive 0-1 range where higher is better
    // Using sigmoid-like normalization
    const absRank = Math.abs(bm25Rank);
    return 1 / (1 + absRank / 10);
  }

  /**
   * Get index statistics
   */
  async getStats(): Promise<{ indexedBlocks: number; lastIndexedAt?: number }> {
    const countResult = this.db
      .prepare("SELECT COUNT(*) as count FROM search_fts5_blocks")
      .get() as { count: number };

    const lastResult = this.db
      .prepare(
        "SELECT MAX(updated_at) as last_updated FROM search_fts5_blocks"
      )
      .get() as { last_updated: number | null };

    return {
      indexedBlocks: countResult.count,
      lastIndexedAt: lastResult.last_updated ?? undefined,
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
