# Plan: Block Event Middleware

## Goal

Introduce a **middleware pipeline** for block create/update/delete that:

1. Runs **before** operations are written (pre-write): middleware can inspect and **transform** operations (e.g. normalize, enrich, or side-effect before persist).
2. Runs **after** operations are written (post-write): middleware is notified of applied changes only (e.g. search indexing, analytics).

The design must fit the existing **dependency injection** system (Container in `ServiceRegistry`) and avoid requiring multi-binding or reflection.

---

## Current Flow

```
Renderer (useDocumentSync)
  → IPC "block-operations:apply"
  → blockHandlers.ts
    → ad-hoc image cleanup (deletions only)
    → documentManager.getBlockService(documentId).applyOperations(operations, origin)
  → BlockOperationService.applyOperations
    → persistOperationSync (SQLite)
    → applyToYDoc (Y.js)
    → eventLogger, scheduleBroadcast, evaluateSnapshotCreation
```

There is no single place where “all block changes” can be observed or transformed. Search indexing and other cross-cutting behavior have no hook.

---

## Proposed Contracts

### Pre-write middleware (transform)

Runs **before** persist + Y.doc. Receives operations and origin; returns **modified operations** that will be applied. Order matters (first middleware output is second middleware input). Enables:

- Normalizing or validating block data
- Enriching operations with system metadata
- Side effects that must happen before write (e.g. reserving IDs, validating refs)
- **Not** for search indexing (nothing has been written yet)

```typescript
// domains/blocks/core/middleware.ts (or interfaces.ts)

export interface BlockPreWriteContext {
  documentId: string;
  origin?: TransactionOrigin;
}

export interface IBlockPreWriteMiddleware {
  /**
   * Transform operations before they are persisted and applied to Y.doc.
   * Return a new array (or the same reference if no change).
   * Throwing aborts the apply.
   */
  transform(
    operations: BlockOperation[],
    context: BlockPreWriteContext
  ): BlockOperation[] | Promise<BlockOperation[]>;
}
```

### Post-write middleware (observe)

Runs **after** persist + Y.doc. Receives the same operations, origin, and the apply result. Fire-and-forget or async; return value ignored. Enables:

- Search indexing (FTS5 / vector)
- Analytics or event forwarding
- Cache invalidation
- **Not** for changing what was written (already committed)

```typescript
export interface BlockPostWriteContext {
  documentId: string;
  origin?: TransactionOrigin;
}

export interface IBlockPostWriteMiddleware {
  /**
   * Called after operations have been applied (SQLite + Y.doc).
   * Do not mutate operations; document state is already updated.
   */
  afterApply(
    operations: BlockOperation[],
    result: OperationResult,
    context: BlockPostWriteContext
  ): void | Promise<void>;
}
```

---

## Pipeline Runner

A single service runs both phases and does not perform the apply itself. The **caller** (IPC handler or any code that today calls `applyOperations`) remains responsible for:

1. Resolving `documentId` (e.g. active document).
2. Calling `pipeline.runPreWrite(operations, origin, { documentId })` → `modifiedOperations`.
3. Calling `blockOperationService.applyOperations(modifiedOperations, origin)` → `result`.
4. Calling `pipeline.runPostWrite(operations, origin, result, { documentId })`.

So `BlockOperationService` stays unchanged; the pipeline wraps the call site.

```typescript
// domains/blocks/services/BlockMiddlewarePipeline.ts

export interface BlockMiddlewarePipeline {
  runPreWrite(
    operations: BlockOperation[],
    origin: TransactionOrigin | undefined,
    context: BlockPreWriteContext
  ): Promise<BlockOperation[]>;

  runPostWrite(
    operations: BlockOperation[],
    origin: TransactionOrigin | undefined,
    result: OperationResult,
    context: BlockPostWriteContext
  ): Promise<void>;
}
```

Implementation: hold two arrays (`preWrite: IBlockPreWriteMiddleware[]`, `postWrite: IBlockPostWriteMiddleware[]`). `runPreWrite` reduces over `preWrite` (each step passes output to next). `runPostWrite` runs all `postWrite` (parallel or sequential; sequential is safer for now).

---

## Dependency Injection Integration

The Container has **one registration per name** and no multi-binding. Middleware is therefore supplied as **composite services** that return arrays:

| Service name                | Role                          | Dependencies                                            | Factory returns               |
| --------------------------- | ----------------------------- | ------------------------------------------------------- | ----------------------------- |
| `blockPreWriteMiddlewares`  | List of pre-write handlers    | Any services that implement pre-write                   | `IBlockPreWriteMiddleware[]`  |
| `blockPostWriteMiddlewares` | List of post-write handlers   | e.g. `searchIndexManager`                               | `IBlockPostWriteMiddleware[]` |
| `blockMiddlewarePipeline`   | Runner that runs pre and post | `blockPreWriteMiddlewares`, `blockPostWriteMiddlewares` | `BlockMiddlewarePipeline`     |

Example registration:

```typescript
// ServiceRegistry.ts

container.register("blockPreWriteMiddlewares", {
  version: "1.0.0",
  dependencies: [], // Add e.g. imageService if we move image-delete cleanup here
  factory: async (c) => {
    const middlewares: IBlockPreWriteMiddleware[] = [];
    // Optional: (await c.resolve("imageService")) → push adapter
    return middlewares;
  },
});

container.register("blockPostWriteMiddlewares", {
  version: "1.0.0",
  dependencies: ["searchIndexManager"],
  factory: async (c) => {
    const searchIndexManager = await c.resolve("searchIndexManager");
    return [
      {
        afterApply: (ops, result, ctx) =>
          searchIndexManager.indexOperations(ops, ctx.documentId),
      },
    ];
  },
});

container.register("blockMiddlewarePipeline", {
  version: "1.0.0",
  dependencies: ["blockPreWriteMiddlewares", "blockPostWriteMiddlewares"],
  factory: async (c) => {
    const pre = await c.resolve("blockPreWriteMiddlewares");
    const post = await c.resolve("blockPostWriteMiddlewares");
    return new BlockMiddlewarePipelineImpl(pre, post);
  },
});
```

SearchIndexManager would get a new method, e.g. `indexOperations(operations: BlockOperation[], documentId: string)`, that derives block create/update/delete from `operations` and calls existing `indexBlock` / `removeBlock` / `reindexDocument` as needed.

New middleware is added by updating the composite factory (e.g. push another item into `blockPostWriteMiddlewares` and add its dependency). No change to pipeline or handler.

---

## Where the Pipeline Is Invoked

**Option A – IPC handler only**  
`createBlockHandlers` receives `blockMiddlewarePipeline` and `documentManager`. Before `applyOperations`, call `runPreWrite`; after, call `runPostWrite`. Image-deletion logic can move into a pre-write middleware (or stay as a post-write side effect that only looks at deletions).

**Option B – BlockOperationService**  
Inject the pipeline into `BlockOperationService.applyOperations`: run pre-write at the start, then current logic, then post-write at the end. Requires `BlockOperationService` to receive `documentId` (it already has it per instance) and to take an optional pipeline dependency. All callers (IPC and any future ones) get middleware automatically.

**Option C – Applier service (recommended)**  
Introduce **BlockOperationsApplier**: depends on `documentManager` and `blockMiddlewarePipeline`. Single method `apply(documentId, operations, origin)` runs pre-write → `blockService.applyOperations` → post-write. IPC (and any future callers) use the applier instead of calling `applyOperations` directly. BlockOperationService stays unchanged; pipeline stays out of the block service, avoiding circular deps.

---

## BlockOperationService Changes (Option B – not recommended: circular dep risk)

- Add optional dependency: `blockMiddlewarePipeline` (or resolve from container only when present to avoid forcing a circular dep).
- In `applyOperations(operations, origin)`:
  1. If pipeline present: `modifiedOps = await pipeline.runPreWrite(operations, origin, { documentId: this.documentId })`; else `modifiedOps = operations`.
  2. Existing logic: persist + applyToYDoc using `modifiedOps`.
  3. If pipeline present: `await pipeline.runPostWrite(modifiedOps, origin, result, { documentId: this.documentId })`.
- Pipeline must be resolved after `BlockOperationService` (e.g. in a wrapper or via a setter/late binding) to avoid circular dependency if pipeline depends on services that depend on DocumentManager (which uses BlockOperationService). So: **pipeline is not a constructor dependency of BlockOperationService**. Instead, the **IPC handler** (or an app-level “BlockOperationsApplier” that depends on pipeline + documentManager) does: run pre-write → get block service and call applyOperations → run post-write. That keeps BlockOperationService free of pipeline and avoids cycles.

The recommended integration is **Option C (Applier)**; see BlockOperationsApplier section below.

---

## BlockOperationsApplier (Recommended)

To keep the handler thin and centralize “apply with middleware” in one place:

- **BlockOperationsApplier** (new): depends on `documentManager`, `blockMiddlewarePipeline`. Method `apply(documentId, operations, origin)`:
  1. Gets `blockService = documentManager.getBlockService(documentId)`.
  2. `modifiedOps = await pipeline.runPreWrite(operations, origin, { documentId })`.
  3. `result = await blockService.applyOperations(modifiedOps, origin)`.
  4. `await pipeline.runPostWrite(modifiedOps, origin, result, { documentId })`.
  5. Returns `result`.

IPC handler then only calls `blockOperationsApplier.apply(activeDocument.id, operations, origin)`. All apply paths that go through the applier get middleware. BlockOperationService stays unchanged.

---

## Summary

| Item                | Proposal                                                                                                                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Pre-write**       | `IBlockPreWriteMiddleware.transform(operations, context)` → return new/modified operations; used for transforms before write.                                                              |
| **Post-write**      | `IBlockPostWriteMiddleware.afterApply(operations, result, context)`; used for search indexing and other observe-only logic.                                                                |
| **DI**              | No multi-binding. Composite services `blockPreWriteMiddlewares` and `blockPostWriteMiddlewares` return arrays; `blockMiddlewarePipeline` depends on both and runs them.                    |
| **Invocation**      | **BlockOperationsApplier** depends on pipeline + documentManager and exposes `apply(documentId, operations, origin)`; IPC handler calls the applier.                                       |
| **Search indexing** | Implement `IBlockPostWriteMiddleware` that calls `SearchIndexManager.indexOperations(operations, documentId)` (new method that maps operations to indexBlock/removeBlock/reindexDocument). |

---

## Implementation Order

1. **Contracts** – Add `IBlockPreWriteMiddleware`, `IBlockPostWriteMiddleware`, `BlockPreWriteContext`, `BlockPostWriteContext`, and `BlockMiddlewarePipeline` in `domains/blocks` (e.g. `core/middleware.ts` or `core/interfaces.ts`).
2. **Pipeline impl** – Implement `BlockMiddlewarePipelineImpl` in `domains/blocks/services/` with `runPreWrite` (reduce) and `runPostWrite` (forEach/parallel).
3. **DI** – Register `blockPreWriteMiddlewares`, `blockPostWriteMiddlewares`, `blockMiddlewarePipeline` in ServiceRegistry; start with empty pre and post list.
4. **Call site** – Add `BlockOperationsApplier` (or wire pipeline in blockHandlers); switch IPC to use applier so all applies go through the pipeline.
5. **Search** – Add `SearchIndexManager.indexOperations(operations, documentId)` and a small adapter in `blockPostWriteMiddlewares` that calls it.
6. **Optional** – Move image-deletion logic from blockHandlers into a pre-write or post-write middleware.

This gives a single, DI-friendly pattern for both “change blocks before write” and “react after write” without changing BlockOperationService internals or adding multi-binding to the container.
