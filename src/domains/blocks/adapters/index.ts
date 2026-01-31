// Blocks Domain - Adapters
//
// External system integration adapters.
// These translate between external formats (BlockNote, IPC) and our domain model.

export { BlockNoteAdapter } from './BlockNoteAdapter';
export type { BlockChange } from './blocknote-types';
export { BLOCKNOTE_SOURCE_MAP } from './blocknote-types';

// Legacy export for backward compatibility
export { BlockNoteAdapter as BlockNoteOperationConverter } from './BlockNoteAdapter';
