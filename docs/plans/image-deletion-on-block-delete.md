# Plan: Fix Image Deletion When Blocks Are Deleted

## Problem Statement

Currently, there's code in `blockHandlers.ts` that attempts to clean up images when blocks are deleted, but it doesn't work. The code tries to:
1. Find delete operations
2. Get the block from Y.js before deletion using `blockOperationService.getBlocks()`
3. Extract image IDs from the block
4. Delete the images

**Issues with current approach:**
- `useDocumentSync` sends document-level "update" operations, NOT individual "delete" operations
- The cleanup code filters for `op.type === "delete"` but never receives any
- Y.js lookup is unnecessary - BlockNote already provides the deleted block data via `getChanges()`

## Root Cause

- `useDocumentSync` uses `editor.onChange()` but only accesses `editor.document`
- BlockNote's `onChange` callback provides a second argument with `getChanges()` that includes deletion info
- The changes are computed but never sent to the main process

## Solution: Pass Changes Alongside Document

**Key Insight:** BlockNote already computes the changes. We just need to pass them through.

### Approach

Modify `useDocumentSync` to:
1. Accept the `getChanges()` callback from `onChange`
2. Include the changes array in the operation payload
3. Let `blockHandlers.ts` extract deletions from `operation.changes`

**Why this is simpler than alternatives:**
- No new hooks or parallel abstractions
- No diffing logic in the main process
- No shadow state management
- Single source of truth (BlockNote computes changes once)
- Minimal code changes (~10 lines modified)

### BlockNote Image Block Structure
- BlockNote image blocks have `type: "image"`
- Image URL is stored in `block.props.src` as `digest-image://<id>`
- The block structure is: `{ id, type: "image", props: { src: "digest-image://<id>", ... } }`

## Implementation

### Step 1: Update `useDocumentSync` to Include Changes

**Location**: `src/hooks/useDocumentSync.ts`

**Change**: Modify `handleDocumentChange` to accept and forward the changes.

```typescript
// Before (line 60)
const handleDocumentChange = (currentEditor: CustomBlockNoteEditor) => {

// After
const handleDocumentChange = (
  currentEditor: CustomBlockNoteEditor,
  { getChanges }: { getChanges: () => any[] }
) => {
```

Then include changes in the operation (around line 18-29):

```typescript
const saveUserOperation = useDebounced<{ document: any[]; changes: any[] }>(
  ({ document, changes }) => {
    const operation = {
      id: `user-edit-${Date.now()}`,
      type: "update" as const,
      blockId: "document-root",
      source: "user" as const,
      timestamp: Date.now(),
      block: null as any,
      document: document,
      changes: changes,  // NEW: include the changes
      userId: "local-user",
      requestId: `user-edit-${Date.now()}`,
    };
    // ... rest unchanged
  },
  2000
);
```

And update the call site (around line 87):

```typescript
// Before
saveUserOperation(currentDocument);

// After
const changes = getChanges();
saveUserOperation({ document: currentDocument, changes });
```

### Step 2: Update `blockHandlers.ts` to Extract Deletions from Changes

**Location**: `src/ipc/handlers/blockHandlers.ts`

Replace the broken Y.js lookup code with change-based extraction:

```typescript
// Clean up images for deleted blocks
if (imageService && operations.length > 0) {
  for (const op of operations) {
    // Check for deletions in the changes array
    const changes = (op as any).changes ?? [];
    const deletions = changes.filter((c: any) => c.type === "delete");

    for (const deletion of deletions) {
      try {
        const deletedBlock = deletion.block;
        if (!deletedBlock) continue;

        const imageIds = ImageService.extractImageIdsFromBlock(deletedBlock);

        for (const imageId of imageIds) {
          const deleted = imageService.deleteImage(imageId);
          if (deleted) {
            log.debug(
              `Cleaned up image ${imageId} for deleted block ${deletedBlock.id}`,
              "blockHandlers"
            );
          }
        }

        if (imageIds.length > 0) {
          log.debug(
            `Cleaned up ${imageIds.length} image(s) for deleted block ${deletedBlock.id}`,
            "blockHandlers"
          );
        }
      } catch (error) {
        log.debug(
          `Error cleaning up images for deleted block: ${error}`,
          "blockHandlers"
        );
      }
    }
  }
}
```

### Step 3: Update BlockOperation Type (Optional)

**Location**: `src/types/` (wherever BlockOperation is defined)

Add `changes` to the type:

```typescript
interface BlockOperation {
  // ... existing fields
  changes?: Array<{
    type: "insert" | "delete" | "update" | "move";
    block: any;
    prevBlock?: any;  // For updates/moves
    source?: { type: string };
  }>;
}
```

## What Gets Removed

The broken Y.js lookup code in `blockHandlers.ts`:

```typescript
// REMOVE THIS:
const blocks = blockOperationService.getBlocks();
const blockToDelete = blocks.find(
  (b: any) => b.id === deleteOp.blockId
);
```

## Testing Plan

1. **Basic Test**:
   - Add an image block to a document
   - Delete the image block
   - Verify image is deleted from database
   - Check logs for cleanup messages

2. **Nested Images Test**:
   - Create a block with nested children containing images
   - Delete the parent block
   - Verify all nested images are cleaned up

3. **Edge Cases**:
   - Delete non-image block (should do nothing)
   - Delete image that's already deleted (should handle gracefully)
   - Rapid deletions (debouncing shouldn't lose deletions)

## Key Properties of This Solution

- **Simple**: ~20 lines changed across 2 files
- **No new abstractions**: No new hooks, no shadow state, no diffing
- **Uses existing data**: BlockNote already computed the changes
- **Single responsibility**: `useDocumentSync` still just syncs documents
- **Backwards compatible**: Adding `changes` field doesn't break existing code

## Files Changed

1. `src/hooks/useDocumentSync.ts` - Accept and forward changes
2. `src/ipc/handlers/blockHandlers.ts` - Extract deletions from changes

## Notes

- The 2-second debounce in `useDocumentSync` means deletions are batched. This is fine - all deletions within the window will be in the `changes` array.
- `getChanges()` returns changes since the last `onChange` call, so we won't miss any deletions.
- If a block is deleted and re-added within the debounce window, both changes will be present. The cleanup code only acts on deletions, so this is safe.



