import * as Y from "yjs";
import Database from "better-sqlite3";
import {
  BlockOperation,
  OperationResult,
  OperationRecord,
  TransactionOrigin,
  BatchOperation,
} from "../types/operations";
import { log } from "../utils/mainLogger";
import { getEventLogger } from "./EventLogger";
// Simple ID generator to replace uuid dependency
const generateId = () =>
  `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

type StoredSnapshot = {
  data: Uint8Array;
  createdAt: number;
  operationCount: number;
};

/**
 * Unified service for handling block operations from both users and LLM
 * Manages Y.js document state and SQLite persistence
 */
export class BlockOperationService {
  private static instances: Map<string, BlockOperationService> = new Map();
  private static database: Database.Database | null = null;
  private yDoc: Y.Doc;
  private yBlocks: Y.Array<any>;
  private database: Database.Database;
  private documentId: string;
  private rendererWebContents: Electron.WebContentsView | null = null;
  private _eventLogger: ReturnType<typeof getEventLogger> | null = null;

  private get eventLogger() {
    if (!this._eventLogger) {
      this._eventLogger = getEventLogger();
    }
    return this._eventLogger;
  }

  // Operation batching for performance
  private pendingOperations: BlockOperation[] = [];
  private batchTimeout: NodeJS.Timeout | null = null;
  private readonly BATCH_DELAY_MS = 50;

  // Snapshot tracking for efficient reloads
  private operationsSinceLastSnapshot = 0;
  private lastSnapshotOperationCount = 0;
  private lastSnapshotCreatedAt = 0;
  private readonly INITIAL_SNAPSHOT_OPERATION_THRESHOLD = 1;
  private readonly SNAPSHOT_OPERATION_THRESHOLD = 200;
  private readonly SNAPSHOT_MIN_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes
  private readonly MAX_STORED_SNAPSHOTS = 5;

  private constructor(documentId = "default", database?: Database.Database) {
    const resolvedDatabase = database ?? BlockOperationService.database;
    if (!resolvedDatabase) {
      throw new Error(
        "BlockOperationService database not configured. Call setDatabase first or provide a database handle."
      );
    }

    if (!BlockOperationService.database) {
      BlockOperationService.database = resolvedDatabase;
    }

    this.documentId = documentId;
    this.yDoc = new Y.Doc();
    this.yBlocks = this.yDoc.getArray("blocks");
    this.database = resolvedDatabase;

    // Set up Y.js change listener
    this.yDoc.on("update", this.handleYDocUpdate.bind(this));

    // Database will be set via setDatabase() method after initialization

    log.debug(
      `BlockOperationService initialized for document: ${documentId}`,
      "BlockOperationService"
    );
  }

  public static getInstance(
    documentId = "default",
    database?: Database.Database
  ): BlockOperationService {
    const targetId = documentId || "default";
    if (!BlockOperationService.instances.has(targetId)) {
      BlockOperationService.instances.set(
        targetId,
        new BlockOperationService(targetId, database)
      );
    }
    return BlockOperationService.instances.get(targetId)!;
  }

  /**
   * Set the database instance (called after migration system initialization)
   */
  public static setDatabase(database: Database.Database): void {
    BlockOperationService.database = database;
    log.debug(
      "Database instance configured for BlockOperationService",
      "BlockOperationService"
    );
  }


  /**
   * Set the renderer web contents for sending updates
   */
  setRendererWebContents(webContents: Electron.WebContentsView): void {
    this.rendererWebContents = webContents;
  }

  /**
   * Main entry point: apply block operations (from either user or LLM)
   * Enhanced with Y.js transaction metadata for provenance tracking
   */
  async applyOperations(
    operations: BlockOperation[],
    origin?: TransactionOrigin
  ): Promise<OperationResult> {
    const batchId = origin?.batchId || `batch-${Date.now()}`;
    log.debug(
      `Applying ${operations.length} operations with batch ID: ${batchId}`,
      "BlockOperationService"
    );

    const result: OperationResult = {
      success: true,
      operationsApplied: 0,
      errors: [],
      conflicts: [],
      batchId,
    };

    // Use Y.js transaction to group all operations with metadata
    this.yDoc.transact(() => {
      for (const operation of operations) {
        try {
          // Persist to SQLite first with transaction metadata
          this.persistOperationSync(operation, origin);

          // Apply to Y.js document (inside transaction)
          this.applyToYDoc(operation);

          result.operationsApplied++;
        } catch (error) {
          result.success = false;
          result.errors?.push(
            `Failed to apply operation ${operation.blockId}: ${error}`
          );
          log.debug(
            `Error applying operation ${operation.blockId}: ${error}`,
            "BlockOperationService"
          );
        }
      }
    }, origin); // ← Pass transaction origin to Y.js

    // Log block operation event
    this.eventLogger.logBlockOperation(
      operations,
      origin?.source === 'ai' ? 'ai' : (origin?.source === 'sync' ? 'sync' : 'user'),
      result,
      {
        batchId,
        requestId: origin?.requestId,
        timing: { startTime: Date.now(), endTime: Date.now() },
        source: 'BlockOperationService',
        documentId: this.documentId,
        blockCount: this.yBlocks.length
      }
    );

    // Batch the update broadcast to renderer
    this.scheduleBroadcast(operations);

    await this.evaluateSnapshotCreation(result.operationsApplied);

    return result;
  }

  /**
   * Apply a batch operation with rich metadata
   */
  async applyBatchOperation(batchOp: BatchOperation): Promise<OperationResult> {
    log.debug(
      `Applying batch operation ${batchOp.id} with ${batchOp.operations.length} operations`,
      "BlockOperationService"
    );

    return this.applyOperations(batchOp.operations, batchOp.origin);
  }

  /**
   * Persist operation to SQLite for event sourcing (async version)
   */
  private async persistOperation(operation: BlockOperation): Promise<void> {
    this.persistOperationSync(operation);
  }

  /**
   * Persist operation to SQLite for event sourcing with transaction metadata
   * Synchronous version for use inside Y.js transactions
   */
  private persistOperationSync(
    operation: BlockOperation,
    origin?: TransactionOrigin
  ): void {
    if (!this.database) return;

    try {
      const stmt = this.database.prepare(`
        INSERT INTO operations (
          id, document_id, operation_type, block_id, operation_data,
          applied_at, source, user_id, checksum, batch_id, request_id, 
          origin_data
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const operationData = JSON.stringify(operation);
      const checksum = this.calculateChecksum(operationData);

      stmt.run(
        generateId(),
        this.documentId,
        operation.type,
        operation.blockId,
        operationData,
        Date.now(),
        operation.source,
        operation.userId || null,
        checksum,
        operation.batchId || origin?.batchId || null,
        operation.requestId || origin?.requestId || null,
        origin ? JSON.stringify(origin) : null
      );

      log.debug(
        `Persisted operation: ${operation.type} for block ${
          operation.blockId
        } ${origin?.batchId ? `(batch: ${origin.batchId})` : ""}`,
        "BlockOperationService"
      );
    } catch (error) {
      log.debug(
        `Error persisting operation: ${error}`,
        "BlockOperationService"
      );
      throw error;
    }
  }

  /**
   * Apply operation to Y.js document (called from within a transaction)
   * No longer wraps in its own transaction - operations are batched at higher level
   */
  private applyToYDoc(operation: BlockOperation): void {
    switch (operation.type) {
      case "insert":
        if (operation.block) {
          const position = operation.position || this.yBlocks.length;
          this.yBlocks.insert(position, [operation.block]);
        }
        break;

      case "update":
        if (operation.blockId === "document-root" && operation.document) {
          // Handle document-level updates (replace entire document)
          this.yBlocks.delete(0, this.yBlocks.length);
          this.yBlocks.insert(0, operation.document);
        } else if (operation.block) {
          // Handle single block updates
          const index = this.findBlockIndex(operation.blockId);
          if (index !== -1) {
            this.yBlocks.delete(index, 1);
            this.yBlocks.insert(index, [operation.block]);
          }
        }
        break;

      case "delete": {
        const deleteIndex = this.findBlockIndex(operation.blockId);
        if (deleteIndex !== -1) {
          this.yBlocks.delete(deleteIndex, 1);
        }
        break;
      }

      case "move": {
        // Handle block reordering
        const moveIndex = this.findBlockIndex(operation.blockId);
        if (moveIndex !== -1 && operation.position !== undefined) {
          const block = this.yBlocks.get(moveIndex);
          this.yBlocks.delete(moveIndex, 1);
          this.yBlocks.insert(operation.position, [block]);
        }
        break;
      }
    }
  }

  /**
   * Find block index in Y.Array by block ID
   */
  private findBlockIndex(blockId: string): number {
    const blocks = this.yBlocks.toArray();
    return blocks.findIndex((block: any) => block.id === blockId);
  }

  /**
   * Handle Y.js document updates and broadcast to renderer
   * Enhanced with transaction origin metadata for provenance tracking
   */
  private handleYDocUpdate(update: Uint8Array, origin: any): void {
    if (
      this.rendererWebContents &&
      !this.rendererWebContents.webContents.isDestroyed()
    ) {
      // Convert Y.Doc state to blocks array for renderer
      const blocks = this.yBlocks.toArray();

      // Enhanced broadcast with transaction metadata
      this.rendererWebContents.webContents.send("document-update", {
        blocks,
        origin: origin as TransactionOrigin, // Cast to our typed origin
        updateVector: Array.from(update),
        timestamp: Date.now(),
        blockCount: blocks.length,
      });

      const originDescription = origin
        ? `(${origin.source}${
            origin.batchId ? `, batch: ${origin.batchId}` : ""
          })`
        : "";

      log.debug(
        `Broadcasted document update to renderer: ${blocks.length} blocks ${originDescription}`,
        "BlockOperationService"
      );
    }
  }

  /**
   * Schedule batched broadcast to avoid overwhelming renderer
   */
  private scheduleBroadcast(operations: BlockOperation[]): void {
    this.pendingOperations.push(...operations);

    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
    }

    this.batchTimeout = setTimeout(() => {
      this.flushPendingBroadcast();
    }, this.BATCH_DELAY_MS);
  }

  /**
   * Flush pending operations to renderer
   */
  private flushPendingBroadcast(): void {
    if (this.pendingOperations.length === 0) return;

    // The Y.js update handler will take care of broadcasting
    // This method is for future use if we need additional batching logic
    this.pendingOperations = [];
    this.batchTimeout = null;
  }

  /**
   * Load document from persistence on startup
   */
  async loadDocument(): Promise<any[]> {
    if (!this.database) return [];

    try {
      // Try to load latest snapshot first
      const snapshot = this.loadLatestSnapshot();
      if (snapshot) {
        Y.applyUpdate(this.yDoc, snapshot.data);
        this.updateSnapshotTracking(snapshot);

        const appliedAfterSnapshot = await this.replayOperations({
          offset: snapshot.operationCount,
        });

        log.debug(
          `Loaded document from snapshot (applied ${appliedAfterSnapshot} operations after snapshot)`,
          "BlockOperationService"
        );
      } else {
        // Fallback: replay operations from scratch
        await this.replayOperations();
        this.updateSnapshotTracking(null);
        log.debug(
          "Loaded document by replaying operations",
          "BlockOperationService"
        );
      }

      await this.evaluateSnapshotCreation(0, { forceIfNoSnapshot: true });

      // Ensure renderer receives the current state even if Y.js didn't emit an update
      this.handleYDocUpdate(new Uint8Array(), {
        source: "system",
        batchId: `document-load-${this.documentId}`,
        timestamp: Date.now(),
        metadata: {
          reason: "document-load",
          documentId: this.documentId,
        },
      });

      return this.yBlocks.toArray();
    } catch (error) {
      log.debug(`Error loading document: ${error}`, "BlockOperationService");
      return [];
    }
  }

  /**
   * Update snapshot tracking counters
   */
  private updateSnapshotTracking(snapshot: StoredSnapshot | null): void {
    if (!this.database) {
      this.operationsSinceLastSnapshot = 0;
      this.lastSnapshotCreatedAt = snapshot?.createdAt ?? 0;
      this.lastSnapshotOperationCount = snapshot?.operationCount ?? 0;
      return;
    }

    const totalOperations = this.getOperationCount();

    if (snapshot) {
      this.lastSnapshotCreatedAt = snapshot.createdAt;
      this.lastSnapshotOperationCount = snapshot.operationCount;
      this.operationsSinceLastSnapshot = Math.max(
        0,
        totalOperations - snapshot.operationCount
      );
    } else {
      this.lastSnapshotCreatedAt = 0;
      this.lastSnapshotOperationCount = 0;
      this.operationsSinceLastSnapshot = totalOperations;
    }
  }

  /**
   * Seed initial content if database is empty
   */
  async seedInitialContent(initialBlocks: any[]): Promise<void> {
    if (!this.database || !initialBlocks || initialBlocks.length === 0) {
      return;
    }

    try {
      log.debug(
        `Seeding initial content with ${initialBlocks.length} blocks`,
        "BlockOperationService"
      );

      const operations: BlockOperation[] = initialBlocks.map(
        (block, index) => ({
          id: `seed-${Date.now()}-${index}`,
          type: "insert" as const,
          blockId: block.id || `seed-block-${index}`,
          source: "system" as const,
          timestamp: Date.now(),
          block: block,
          document: initialBlocks,
          userId: "system",
          requestId: `seed-${Date.now()}`,
        })
      );

      const origin: TransactionOrigin = {
        source: "system",
        batchId: `seed-batch-${Date.now()}`,
        requestId: `seed-${Date.now()}`,
        timestamp: Date.now(),
      };

      await this.applyOperations(operations, origin);

      log.debug(
        `Successfully seeded ${operations.length} initial blocks`,
        "BlockOperationService"
      );
    } catch (error) {
      log.debug(
        `Error seeding initial content: ${error}`,
        "BlockOperationService"
      );
      throw error;
    }
  }

  /**
   * Load latest document snapshot
   */
  private loadLatestSnapshot(): StoredSnapshot | null {
    if (!this.database) return null;

    try {
      const stmt = this.database.prepare(`
        SELECT snapshot_data, created_at, operation_count FROM snapshots
        WHERE document_id = ?
        ORDER BY created_at DESC
        LIMIT 1
      `);

      const row = stmt.get(this.documentId) as any;
      return row
        ? {
            data: new Uint8Array(row.snapshot_data),
            createdAt: row.created_at || 0,
            operationCount: row.operation_count || 0,
          }
        : null;
    } catch (error) {
      log.debug(`Error loading snapshot: ${error}`, "BlockOperationService");
      return null;
    }
  }

  /**
   * Replay operations from database (for loading without snapshot)
   */
  private async replayOperations(options: { offset?: number } = {}): Promise<number> {
    if (!this.database) return 0;

    const { offset = 0 } = options;

    try {
      const stmt = this.database.prepare(`
        SELECT operation_data FROM operations 
        WHERE document_id = ? 
        ORDER BY applied_at ASC
        LIMIT -1 OFFSET ?
      `);

      const rows = stmt.all(this.documentId, offset) as any[];
      let applied = 0;

      for (const row of rows) {
        const operation: BlockOperation = JSON.parse(row.operation_data);
        this.applyToYDoc(operation);
        applied++;
      }

      return applied;
    } catch (error) {
      log.debug(
        `Error replaying operations${offset > 0 ? " after snapshot" : ""}: ${error}`,
        "BlockOperationService"
      );
      throw error;
    }
  }

  /**
   * Determine if a snapshot should be created based on recent activity
   */
  private async evaluateSnapshotCreation(
    operationsApplied = 0,
    options: { forceIfNoSnapshot?: boolean } = {}
  ): Promise<void> {
    if (!this.database) return;

    if (operationsApplied > 0) {
      this.operationsSinceLastSnapshot += operationsApplied;
    }

    const hasSnapshot = this.lastSnapshotCreatedAt > 0;

    if (!hasSnapshot) {
      if (
        (options.forceIfNoSnapshot && this.operationsSinceLastSnapshot > 0) ||
        this.operationsSinceLastSnapshot >= this.INITIAL_SNAPSHOT_OPERATION_THRESHOLD
      ) {
        await this.createSnapshot();
      }
      return;
    }

    if (this.operationsSinceLastSnapshot < this.SNAPSHOT_OPERATION_THRESHOLD) {
      return;
    }

    const now = Date.now();
    if (now - this.lastSnapshotCreatedAt < this.SNAPSHOT_MIN_INTERVAL_MS) {
      return;
    }

    await this.createSnapshot();
  }

  /**
   * Create periodic snapshot for performance
   */
  async createSnapshot(): Promise<void> {
    if (!this.database) return;

    try {
      const snapshot = Y.encodeStateAsUpdate(this.yDoc);
      const operationCount = this.getOperationCount();
      const createdAt = Date.now();

      const stmt = this.database.prepare(`
        INSERT INTO snapshots (id, document_id, snapshot_data, created_at, operation_count)
        VALUES (?, ?, ?, ?, ?)
      `);

      stmt.run(
        generateId(),
        this.documentId,
        snapshot,
        createdAt,
        operationCount
      );

      this.lastSnapshotCreatedAt = createdAt;
      this.lastSnapshotOperationCount = operationCount;
      this.operationsSinceLastSnapshot = 0;

      this.pruneOldSnapshots();

      log.debug("Created document snapshot", "BlockOperationService");
    } catch (error) {
      log.debug(`Error creating snapshot: ${error}`, "BlockOperationService");
    }
  }

  /**
   * Remove stale snapshots beyond retention threshold
   */
  private pruneOldSnapshots(): void {
    if (!this.database) return;

    try {
      const stmt = this.database.prepare(`
        DELETE FROM snapshots
        WHERE id IN (
          SELECT id FROM snapshots
          WHERE document_id = ?
          ORDER BY created_at DESC
          LIMIT -1 OFFSET ?
        )
      `);

      stmt.run(this.documentId, this.MAX_STORED_SNAPSHOTS);
    } catch (error) {
      log.debug(`Error pruning snapshots: ${error}`, "BlockOperationService");
    }
  }

  /**
   * Get total operation count for this document
   */
  private getOperationCount(): number {
    if (!this.database) return 0;

    try {
      const stmt = this.database.prepare(`
        SELECT COUNT(*) as count FROM operations WHERE document_id = ?
      `);
      const row = stmt.get(this.documentId) as any;
      return row.count || 0;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Calculate checksum for operation data integrity
   */
  private calculateChecksum(data: string): string {
    // Simple checksum - could be enhanced with crypto.createHash
    return Buffer.from(data).toString("base64").slice(0, 16);
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
    }

    this.yDoc.destroy();

    this.rendererWebContents = null;

    log.debug("BlockOperationService destroyed", "BlockOperationService");
  }
}
