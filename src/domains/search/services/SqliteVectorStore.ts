/**
 * SqliteVectorStore
 *
 * Vector storage implementation using sqlite-vec extension.
 * Provides similarity search over block embeddings stored in SQLite.
 */

import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import type { IVectorStore, VectorMetadata, VectorSearchResult } from "../core/types";
import { log } from "../../../utils/mainLogger";

/**
 * Configuration for the vector store
 */
export interface VectorStoreConfig {
  /** Embedding dimension (e.g., 1536 for OpenAI, 1024 for Anthropic) */
  dimensions: number;
  /** Name of the embedding model for tracking */
  modelName: string;
}

/**
 * SQLite-based vector store using sqlite-vec extension
 */
export class SqliteVectorStore implements IVectorStore {
  private db: Database.Database;
  private config: VectorStoreConfig;
  private initialized = false;

  // Prepared statements for performance
  private stmtUpsertMeta!: Database.Statement;
  private stmtDeleteMeta!: Database.Statement;
  private stmtDeleteByDoc!: Database.Statement;
  private stmtGetMeta!: Database.Statement;
  private stmtCount!: Database.Statement;

  constructor(db: Database.Database, config: VectorStoreConfig) {
    this.db = db;
    this.config = config;
  }

  /**
   * Initialize the vector store - must be called before use
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Load sqlite-vec extension
      sqliteVec.load(this.db);
      log.debug("sqlite-vec extension loaded", "SqliteVectorStore");

      // Create the vec0 virtual table for vector storage
      // Using float32 vectors for efficiency
      this.db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS block_vectors USING vec0(
          id TEXT PRIMARY KEY,
          embedding float[${this.config.dimensions}]
        );
      `);

      // Prepare statements
      this.stmtUpsertMeta = this.db.prepare(`
        INSERT INTO block_embeddings (id, block_id, document_id, block_type, text_preview, embedding_model, dimensions, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          block_id = excluded.block_id,
          document_id = excluded.document_id,
          block_type = excluded.block_type,
          text_preview = excluded.text_preview,
          embedding_model = excluded.embedding_model,
          dimensions = excluded.dimensions,
          updated_at = excluded.updated_at
      `);

      this.stmtDeleteMeta = this.db.prepare(`
        DELETE FROM block_embeddings WHERE id = ?
      `);

      this.stmtDeleteByDoc = this.db.prepare(`
        DELETE FROM block_embeddings WHERE document_id = ?
      `);

      this.stmtGetMeta = this.db.prepare(`
        SELECT * FROM block_embeddings WHERE id = ?
      `);

      this.stmtCount = this.db.prepare(`
        SELECT COUNT(*) as count FROM block_embeddings
      `);

      this.initialized = true;
      log.debug(
        `SqliteVectorStore initialized with ${this.config.dimensions} dimensions`,
        "SqliteVectorStore"
      );
    } catch (error) {
      log.debug(`Failed to initialize SqliteVectorStore: ${error}`, "SqliteVectorStore");
      throw error;
    }
  }

  /**
   * Insert or update a vector with metadata
   */
  async upsert(id: string, vector: number[], metadata: VectorMetadata): Promise<void> {
    this.ensureInitialized();

    if (vector.length !== this.config.dimensions) {
      throw new Error(
        `Vector dimension mismatch: expected ${this.config.dimensions}, got ${vector.length}`
      );
    }

    const transaction = this.db.transaction(() => {
      // Upsert metadata
      this.stmtUpsertMeta.run(
        id,
        metadata.blockId,
        metadata.documentId,
        metadata.blockType,
        metadata.textPreview.slice(0, 500), // Limit preview length
        this.config.modelName,
        this.config.dimensions,
        metadata.updatedAt
      );

      // Upsert vector - delete then insert for vec0
      this.db.prepare(`DELETE FROM block_vectors WHERE id = ?`).run(id);
      this.db.prepare(`
        INSERT INTO block_vectors (id, embedding)
        VALUES (?, ?)
      `).run(id, new Float32Array(vector));
    });

    transaction();
    log.debug(`Upserted vector for block ${metadata.blockId}`, "SqliteVectorStore");
  }

  /**
   * Search for similar vectors using cosine distance
   */
  async search(queryVector: number[], limit: number): Promise<VectorSearchResult[]> {
    this.ensureInitialized();

    if (queryVector.length !== this.config.dimensions) {
      throw new Error(
        `Query vector dimension mismatch: expected ${this.config.dimensions}, got ${queryVector.length}`
      );
    }

    // Query vec0 for nearest neighbors
    const vectorResults = this.db.prepare(`
      SELECT id, distance
      FROM block_vectors
      WHERE embedding MATCH ?
      ORDER BY distance
      LIMIT ?
    `).all(new Float32Array(queryVector), limit) as Array<{ id: string; distance: number }>;

    // Join with metadata
    const results: VectorSearchResult[] = [];
    for (const vr of vectorResults) {
      const meta = this.stmtGetMeta.get(vr.id) as {
        block_id: string;
        document_id: string;
        block_type: string;
        text_preview: string;
        updated_at: number;
      } | undefined;

      if (meta) {
        results.push({
          id: vr.id,
          score: 1 - vr.distance, // Convert distance to similarity score
          metadata: {
            blockId: meta.block_id,
            documentId: meta.document_id,
            blockType: meta.block_type,
            textPreview: meta.text_preview,
            updatedAt: meta.updated_at,
          },
        });
      }
    }

    return results;
  }

  /**
   * Delete a vector by ID
   */
  async delete(id: string): Promise<void> {
    this.ensureInitialized();

    const transaction = this.db.transaction(() => {
      this.stmtDeleteMeta.run(id);
      this.db.prepare(`DELETE FROM block_vectors WHERE id = ?`).run(id);
    });

    transaction();
    log.debug(`Deleted vector ${id}`, "SqliteVectorStore");
  }

  /**
   * Delete all vectors for a document
   */
  async deleteByDocument(documentId: string): Promise<void> {
    this.ensureInitialized();

    // Get all IDs for this document first
    const ids = this.db.prepare(`
      SELECT id FROM block_embeddings WHERE document_id = ?
    `).all(documentId) as Array<{ id: string }>;

    const transaction = this.db.transaction(() => {
      // Delete metadata
      this.stmtDeleteByDoc.run(documentId);

      // Delete vectors
      for (const { id } of ids) {
        this.db.prepare(`DELETE FROM block_vectors WHERE id = ?`).run(id);
      }
    });

    transaction();
    log.debug(
      `Deleted ${ids.length} vectors for document ${documentId}`,
      "SqliteVectorStore"
    );
  }

  /**
   * Get count of indexed vectors
   */
  async count(): Promise<number> {
    this.ensureInitialized();
    const result = this.stmtCount.get() as { count: number };
    return result.count;
  }

  /**
   * Check if a block is already indexed
   */
  async hasBlock(blockId: string): Promise<boolean> {
    this.ensureInitialized();
    const result = this.db.prepare(`
      SELECT 1 FROM block_embeddings WHERE block_id = ? LIMIT 1
    `).get(blockId);
    return !!result;
  }

  /**
   * Get all block IDs for a document
   */
  async getBlockIds(documentId: string): Promise<string[]> {
    this.ensureInitialized();
    const results = this.db.prepare(`
      SELECT block_id FROM block_embeddings WHERE document_id = ?
    `).all(documentId) as Array<{ block_id: string }>;
    return results.map((r) => r.block_id);
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error("SqliteVectorStore not initialized. Call initialize() first.");
    }
  }
}
