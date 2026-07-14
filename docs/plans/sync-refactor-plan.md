# Sync Refactor Plan (granular ops, provenance, clip-ready)

## Summary

Today, `useDocumentSync` persists editor changes by sending a single `update` operation with `blockId: "document-root"` and the **entire document** attached.

This plan refactors sync/persistence to instead send **granular block operations** derived from BlockNote’s `onChange(..., { getChanges })` API, while keeping:
- snapshots (unchanged)
- image deletion on block delete (still supported, and improved)
- upcoming clip insertion (naturally emits “insert many blocks” operations)

BlockNote already attaches a **change source** to each change; we should preserve that provenance instead of collapsing it to `"user"` everywhere.

Reference: BlockNote `getChanges()` shape + change sources: [Understanding Changes](https://www.blocknotejs.org/docs/reference/editor/events#understanding-changes).

## Goals

- Replace “document-root replace” writes with **composable ops** (`insert/update/delete/move`).
- Preserve **provenance** (`local/paste/drop/undo/redo/yjs-remote`) through to:
  - `BlockOperation.source`
  - `TransactionOrigin.source` and metadata
- Keep the persistence backend stable:
  - SQLite operations log remains the source of truth
  - snapshots remain derived data for fast load
- Maintain feature compatibility:
  - delete images when blocks containing images are deleted
  - insert clip content as a batch of ops

## Non-goals

- Changing the DB schema in this pass (unless required)
- Changing Y.js internals (we keep the current Y.Array-of-blocks model for now)
- Perfect conflict resolution / collaboration semantics (still local-first)

## Current state (as-is)

### Current persistence flow

- BlockNote editor changes
  → `useDocumentSync` debounced save
  → `electronAPI.applyBlockOperations([ { type:"update", blockId:"document-root", document:[...] } ], origin)`
  → main: `blockHandlers.ts` → `BlockOperationService.applyOperations`
  → SQLite persists op, Yjs applies op (document-root replace), renderer gets `document-update` with blocks

### What feels off (why refactor)

- “update doc root with the full document” is not really an **operation**; it is a **state snapshot**. It mixes:
  - event-sourced change log
  - full-state replication
- It reduces composability:
  - clip insertion wants “insert N blocks” and “insert container with children”
  - image deletion wants “deleted block content” reliably
- It loses provenance:
  - the BlockNote change sources (paste/drop/undo) are meaningful but currently get flattened.

## Proposed architecture

### Diagram (end-to-end)

```
BlockNote editor
  onChange((editor, { getChanges }) => {
    changes = getChanges()     // insert/delete/update/move + source
    ops = convert(changes)     // BlockOperation[]
    origin = buildOrigin(changes) // TransactionOrigin
    applyBlockOperations(ops, origin)
  })

preload
  ipcRenderer.invoke("block-operations:apply", ops, origin)

main
  BlockOperationService.applyOperations(ops, origin)
    persist ops to SQLite
    apply ops to Yjs
    schedule snapshots (derived)
    broadcast document-update(blocks, origin)

renderer
  onDocumentUpdate -> editor.replaceBlocks(...)
  (skip persistence when origin.source === "user")
```

### Key change: persist changes, not full state

In the renderer:
- Use BlockNote’s `getChanges()` (already wired in `useDocumentSync`).
- Convert changes to `BlockOperation[]` using `BlockNoteOperationConverter`.
- Send those ops to main, batched under one `TransactionOrigin`.

In main:
- `BlockOperationService.applyOperations` already supports granular ops (`insert/update/delete/move`) and snapshots.
- No changes required for snapshotting; fewer/lighter operations make snapshots cheaper.

## Snapshots (still supported)

Snapshots are a derived optimization of the event log:
- Ops are appended to the `operations` table (source data).
- `BlockOperationService` periodically writes Yjs state to `snapshots` (derived).

This remains true after the refactor, and improves in practice:
- Granular ops make the event log smaller and more meaningful.
- Snapshot creation triggers can stay the same.

## Image deletion on block delete (still supported)

We need reliable access to the **deleted block’s content** in order to extract `digest-image://<id>` references.

### Options (choose one)

**Option A (minimal change): keep sending `changes` alongside ops**
- For each `applyBlockOperations` call, include `changes` (BlockNote changes array) on either:
  - each operation (as today), or
  - the `origin.metadata` envelope (preferred; avoids duplication)
- Main-side cleanup logic reads deletions from `changes.filter(c => c.type === "delete")`, extracts image ids, deletes images.

**Option B (more “op-pure”): include deleted block content on delete ops**
- Emit `delete` ops with `{ type:"delete", blockId, block: deletedBlock }`
- Main cleanup becomes purely op-based (no extra `changes` payload needed).

Recommendation:
- Start with **Option A** for minimal churn (it matches today’s working cleanup path).
- Move to **Option B** once op typing is tightened (so “delete includes deleted block value” is a first-class invariant).

## Clip updates (soon supported)

Clips want to insert a *structured set of blocks* (often many) plus provenance container.

With granular ops:
- `ClipInserter` can emit:
  - `insert` for a `clip` container block at the cursor
  - `insert` for each child block (and/or a single insert with children, depending on schema)
- Send as a **single batch** with:
  - `origin.source = "system"` or `"user"` (depending on UX)
  - `origin.metadata = { feature: "clip", sourceUrl, capturedAt, conversionStrategy, ... }`

This reuses the same `applyBlockOperations` pipeline as user edits, without needing document-root replaces.

## Provenance: are we using BlockNote change sources correctly?

BlockNote emits a `source` per change (`local`, `paste`, `drop`, `undo`, `redo`, `undo-redo`, `yjs-remote`) and the docs imply it’s meant for:
- analytics/observability
- guarding feedback loops (ignore `yjs-remote`)
- richer UX decisions (e.g. paste sanitization vs typing)

Reference: [Understanding Changes](https://www.blocknotejs.org/docs/reference/editor/events#understanding-changes).

### Our current mapping (problem)

In `src/types/operations.ts`, `BLOCKNOTE_SOURCE_MAP` maps many sources to `"user"`:
- paste/drop/undo/redo → `"user"`
- only `yjs-remote` → `"sync"`

We also have a richer `TransactionOrigin.source` union that already includes `"paste" | "drop" | "undo"`.

This suggests we are **not using** BlockNote’s provenance as designed; we’re collapsing it.

### Proposed mapping (fix)

- Keep **`BlockOperation.source`** as a coarse bucket (`user | sync | llm | system`) if we want,
  but preserve detail in `TransactionOrigin.source` and `origin.metadata`.

Concretely:
- If the primary change source is `paste`, set `origin.source = "paste"`.
- If `drop`, set `origin.source = "drop"`.
- If `undo` / `redo` / `undo-redo`, set `origin.source = "undo"` (or add `redo` if we want that explicitly).
- If `yjs-remote`, set `origin.source = "sync"` and skip re-persist in renderer (as today).

This keeps the minimal algebra (“apply(ops, origin)”) while retaining provenance for logging and feature logic.

## Implementation plan (incremental)

1) **Renderer: emit ops instead of document-root update**
- In `useDocumentSync`, replace the “document-root update” payload with:
  - `changes = getChanges()`
  - `{ operations, origin } = BlockNoteOperationConverter.convertBlockNoteChanges(changes, userId, requestId)`
  - `applyBlockOperations(operations, originWithBatchId)`

2) **Preserve deletion payload for image cleanup**
- Choose Option A initially:
  - attach `changes` once to `origin.metadata.changes` (preferred), and update main handler to read it there.
  - keep backward compatibility for the current `(op as any).changes` field during migration.

3) **Tighten provenance mapping**
- Update `BLOCKNOTE_SOURCE_MAP` (or stop using it directly) so paste/drop/undo aren’t flattened.

4) **Clips: emit ops**
- Add a `ClipInserter` (or extend existing inserter) that generates operations for inserting a clip container + blocks.

## Testing checklist

- **Typing**: edits persist, reload from snapshot works
- **Paste**: origin shows paste; no loops; content persists
- **Delete image block**: DB image rows are removed
- **Undo/redo**: origin reflects undo; persists correctly (or is ignored, depending on policy)
- **Clip insert batch (stub)**: inserting N blocks uses the same apply-ops path and persists


