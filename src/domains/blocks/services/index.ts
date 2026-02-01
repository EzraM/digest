// Blocks Domain - Services
//
// Service implementations for block operations.
// These services depend on external infrastructure (Y.js, SQLite, Electron).

export { BlockOperationService } from './BlockOperationService';
export { BlockEventManager } from './BlockEventManager';
export { BlockInserter } from './BlockInserter';
export { BlockMiddlewarePipelineImpl } from './BlockMiddlewarePipeline';
export { BlockOperationsApplier } from './BlockOperationsApplier';
export type { BlockEvents } from './BlockEventManager';
export type { BlockCreationRequest } from './BlockInserter';
