import { EventEmitter } from 'events';
import { log } from '../utils/mainLogger';
import { BlockOperationService } from './BlockOperationService';
import { BlockOperation, TransactionOrigin } from '../types/operations';

// Event types for block operations
export interface BlockEvents {
  'block:created': { blockId: string; block: any; source: string };
  'block:updated': { blockId: string; block: any; source: string };
  'block:deleted': { blockId: string; source: string };
  'block:moved': { blockId: string; oldPosition: number; newPosition: number; source: string };
  'blocks:batch-applied': { operations: BlockOperation[]; source: string; batchId: string };
}

/**
 * Event-driven manager for block operations
 * Coordinates between user actions, AI suggestions, and block persistence
 */
export class BlockEventManager extends EventEmitter {
  private static instance: BlockEventManager;
  private blockOperationService: BlockOperationService;

  private constructor() {
    super();
    this.blockOperationService = BlockOperationService.getInstance();
  }

  public static getInstance(): BlockEventManager {
    if (!BlockEventManager.instance) {
      BlockEventManager.instance = new BlockEventManager();
    }
    return BlockEventManager.instance;
  }

  /**
   * User creates a new block
   */
  async handleUserBlockCreation(block: any, position?: number): Promise<void> {
    try {
      const blockId = block.id || `block-${Date.now()}`;
      const operation: BlockOperation = {
        id: `op-${Date.now()}`,
        type: 'insert',
        blockId,
        source: 'user',
        timestamp: Date.now(),
        block,
        position,
        userId: 'user', // TODO: Get from auth context
        requestId: `user-${Date.now()}`
      };

      const origin: TransactionOrigin = {
        source: 'user',
        batchId: `user-batch-${Date.now()}`,
        requestId: operation.requestId,
        timestamp: Date.now()
      };

      await this.blockOperationService.applyOperations([operation], origin);
      
      this.emit('block:created', { blockId, block, source: 'user' });
      
      log.debug(`User created block ${blockId}`, 'BlockEventManager');
    } catch (error) {
      log.debug(`Error handling user block creation: ${error}`, 'BlockEventManager');
      throw error;
    }
  }

  /**
   * User updates an existing block
   */
  async handleUserBlockUpdate(blockId: string, block: any): Promise<void> {
    try {
      const operation: BlockOperation = {
        id: `op-${Date.now()}`,
        type: 'update',
        blockId,
        source: 'user',
        timestamp: Date.now(),
        block,
        userId: 'user',
        requestId: `user-${Date.now()}`
      };

      const origin: TransactionOrigin = {
        source: 'user',
        batchId: `user-batch-${Date.now()}`,
        requestId: operation.requestId,
        timestamp: Date.now()
      };

      await this.blockOperationService.applyOperations([operation], origin);
      
      this.emit('block:updated', { blockId, block, source: 'user' });
      
      log.debug(`User updated block ${blockId}`, 'BlockEventManager');
    } catch (error) {
      log.debug(`Error handling user block update: ${error}`, 'BlockEventManager');
      throw error;
    }
  }

  /**
   * User deletes a block
   */
  async handleUserBlockDeletion(blockId: string): Promise<void> {
    try {
      const operation: BlockOperation = {
        id: `op-${Date.now()}`,
        type: 'delete',
        blockId,
        source: 'user',
        timestamp: Date.now(),
        userId: 'user',
        requestId: `user-${Date.now()}`
      };

      const origin: TransactionOrigin = {
        source: 'user',
        batchId: `user-batch-${Date.now()}`,
        requestId: operation.requestId,
        timestamp: Date.now()
      };

      await this.blockOperationService.applyOperations([operation], origin);
      
      this.emit('block:deleted', { blockId, source: 'user' });
      
      log.debug(`User deleted block ${blockId}`, 'BlockEventManager');
    } catch (error) {
      log.debug(`Error handling user block deletion: ${error}`, 'BlockEventManager');
      throw error;
    }
  }

  /**
   * Set renderer web contents for updates
   */
  setRendererWebContents(webContents: Electron.WebContentsView): void {
    this.blockOperationService.setRendererWebContents(webContents);
  }
}
