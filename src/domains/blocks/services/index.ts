// Blocks Domain - Services
//
// Service implementations for block operations.
// These services depend on external infrastructure (Y.js, SQLite, Electron).

export { BlockOperationService } from './BlockOperationService';
export { BlockEventManager } from './BlockEventManager';
export { BlockInserter } from './BlockInserter';
export type { BlockEvents } from './BlockEventManager';
export type { BlockCreationRequest } from './BlockInserter';
