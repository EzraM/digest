# Blocks Domain - Pure Core

This directory contains the pure functional core of the blocks domain. It has **zero dependencies** on Electron, Y.js, SQLite, or any other runtime infrastructure.

## Architecture Philosophy

Following the "Functional Core, Imperative Shell" pattern:

- **Pure**: All types are plain data with no side effects
- **Immutable**: Types use `readonly` to encourage immutability
- **Testable**: No mocks needed - just type checking
- **Portable**: Can be used in main process, renderer, or tests

## Files

### `types.ts`

Core data types representing blocks and operations:

- `Block`: The fundamental content unit
- `BlockOperation`: A single change (insert, update, delete, move)
- `TransactionOrigin`: Metadata about a group of operations
- `OperationResult`: Result of applying operations
- `OperationRecord`: Persisted operation for event sourcing
- `Snapshot`: Document snapshot for fast reload
- `BlockSearchManifest`: Declares which parts of a block are searchable
- `SearchableBlock`: Extracted content ready for indexing

### `interfaces.ts`

Service contracts that separate concerns:

| Interface | Responsibility |
|-----------|----------------|
| `IBlockOperationApplier` | Apply operations to a document |
| `IOperationStore` | Persist operations (event sourcing) |
| `ISnapshotStore` | Manage document snapshots |
| `IBlockBroadcaster` | Send updates to renderer |
| `IBlockConverter` | Convert BlockNote ↔ our format |
| `IBlockContentExtractor` | Extract searchable content |
| `IBlockSearchIndex` | Index and search blocks |
| `IDocumentService` | High-level document coordination |

## Usage

```typescript
import {
  BlockOperation,
  TransactionOrigin,
  IBlockOperationApplier,
} from '@/domains/blocks/core';

// Types flow through the system
const operation: BlockOperation = {
  type: 'insert',
  blockId: 'block-1',
  source: 'user',
  block: { id: 'block-1', type: 'paragraph', content: 'Hello' },
};

// Interfaces define contracts for implementations
class MyBlockApplier implements IBlockOperationApplier {
  async applyOperations(ops: BlockOperation[]): Promise<OperationResult> {
    // Implementation details hidden behind interface
  }
}
```

## Relationship to BlockOperationService

The current `BlockOperationService` (695 lines) combines multiple responsibilities:

```
BlockOperationService
├── Y.js document management      → IBlockOperationApplier
├── SQLite persistence            → IOperationStore
├── Snapshot management           → ISnapshotStore
├── Broadcasting to renderer      → IBlockBroadcaster
└── Instance management           → (container/DI concern)
```

These interfaces allow incremental refactoring:
1. Define interfaces (done ✓)
2. Make current service implement interfaces
3. Extract implementations one at a time
4. Test each extraction independently

## Search Integration (Future)

The `BlockSearchManifest` and related types prepare for the workspace redesign:

```typescript
const paragraphManifest: BlockSearchManifest = {
  blockType: 'paragraph',
  searchableFields: [
    { path: 'content', fieldType: 'text', weight: 1.0 },
  ],
};

const siteManifest: BlockSearchManifest = {
  blockType: 'site',
  searchableFields: [
    { path: 'props.url', fieldType: 'url', weight: 0.8 },
    { path: 'props.title', fieldType: 'text', weight: 1.0 },
  ],
};
```

This allows the search system to understand how to index different block types without coupling to their implementations.
