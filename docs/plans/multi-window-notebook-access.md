# Multi-Window Notebook Access

## Implementation status

The first collaborative vertical slice was implemented on July 23, 2026:

- Every selected notebook creates a renderer-local `Y.Doc`.
- BlockNote binds directly to the local `"document"` `Y.XmlFragment`.
- Main owns an application-scoped canonical `Y.Doc` per document.
- Subscribe/resynchronize exchanges Yjs state vectors and missing updates.
- Renderer edits are sent as incremental Yjs updates over typed preload IPC.
- Main validates updates on a temporary replica, durably appends them, applies
  them to canonical state, and publishes them to the other subscribers.
- Window sessions own their selected document; `documents:get-active` and
  switching are sender-scoped.
- Existing notebooks were bootstrapped once from legacy block history into the
  collaboration representation before compatibility removal.
- Browser text and image clips now transact through the local collaborative
  editor.
- Concurrent replica, state-vector catch-up, subscription authorization,
  production packaging, legacy bootstrap, and two-real-window loading have
  been verified.
- The one prototype database has collaboration state for every live document.
- The legacy block-operation IPC, renderer-ready handshake, block-array update
  notifications, edit-lease registry, and legacy block persistence services
  have been removed.
- Accepted canonical Yjs state now drives an internal projection pipeline for
  full-text search indexing, removed-image cleanup, and document block counts;
  no renderer IPC was added for derived data.

Remaining hardening:

- Add automated Electron typing coverage across two real windows; the service
  convergence test currently covers simultaneous updates below Electron.
- Compact the append-only Yjs update log into collaboration snapshots.
- Recreate a renderer replica automatically after a locally generated update is
  rejected for persistence or authorization reasons.
- Add optional awareness, presence, and remote cursors.

## Goal

Let any Digest window navigate to a notebook and render its latest committed
state without changing the notebook shown in another window.

Every open notebook gets a window-local Yjs replica bound directly to its
BlockNote editor. The main process keeps the canonical replica and acts as the
in-process synchronization provider:

```text
window A: BlockNote <-> local Y.Doc ──┐
                                      ├── main canonical Y.Doc <-> SQLite
window B: BlockNote <-> local Y.Doc ──┘
```

Every subscribed window may edit the same notebook. Its local transactions are
encoded as incremental Yjs updates; main durably accepts and relays them; and
the replicas converge without replacing complete block arrays.

This is the notebook-data follow-up to
[`multi-window-goal-and-rough-edges.md`](./multi-window-goal-and-rough-edges.md).
The browser presentation and placement split described there is already in
place.

## Current state

The codebase has some of the required foundations:

- Block writes sent through `block-operations:apply` name a `documentId`.
- Main derives the producing renderer from the Electron IPC sender.
- The installed BlockNote version exposes `withCollaboration`, which binds an
  editor to a supplied `Y.XmlFragment`.
- The installed Yjs version supports state-vector synchronization and
  incremental binary updates.
- `BlockOperationService` can retain more than one renderer recipient.
- `WindowRegistry` can resolve and target individual renderer sessions.
- New-window routes can carry the originating `documentId`.

However, notebook access is not yet window-safe:

- `DocumentManager.activeDocumentId` is process-wide.
- `documents:get-active`, initial loading, route fallback, and some profile
  resolution still use that process-wide selection.
- `documents:switch` mutates the global active document before loading the
  initiating renderer.
- Loading a document still mixes renderer registration with document-service
  setup rather than establishing an explicit subscription.
- A block service accumulates renderer objects directly rather than using an
  explicit document subscription registry with cleanup and delivery rules.
- Renderer updates are complete BlockNote arrays backed by a main-process
  `Y.Array<any>`. This bypasses BlockNote's Yjs collaboration representation
  and is not the representation the window-local replicas should synchronize.
- The debounced whole-document save can outlive a route transition.

## Product boundary

For the first milestone:

- Different windows may independently show different notebooks.
- Multiple windows may show the same notebook.
- Every subscribed window maintains a local `Y.Doc` and sees accepted updates.
- Multiple subscribed windows may edit the same notebook concurrently.
- Read-only presentation may still exist for product or authorization reasons,
  but it is not the default multi-window behavior.
- Reopening or returning to a notebook loads the latest canonical state.
- The transport uses Yjs state vectors and incremental updates from the first
  multi-window milestone; it does not introduce a temporary block-array sync
  protocol.

Concurrent same-notebook editing, cross-device synchronization, and restoring a
multi-window workspace after restart remain out of scope.

## Ownership model

Introduce window-scoped document presentation alongside application-scoped
document data:

```text
Application
├── DocumentManager
│   └── document metadata and per-document BlockOperationService
├── DocumentSubscriptionRegistry
│   └── documentId -> renderer IDs
└── WindowRegistry
    └── renderer ID -> WindowSession

WindowSession
└── document presentation
    ├── selectedDocumentId
    ├── subscription
    ├── renderer-local Y.Doc and BlockNote collaboration fragment
    └── access: editable | read-only
```

`DocumentManager` should no longer answer which notebook a window is showing.
That is window-session state. A process-wide default document may remain only
as startup policy for a newly created window.

## Application protocol

Keep the first protocol small and explicit. The exact IPC channel names may
change, but the operations should retain these semantics.

### Create the window-local replica

When a renderer opens document D, it creates a new `Y.Doc`, gets a stable
collaboration fragment such as `ydoc.getXmlFragment("document")`, and constructs
BlockNote with that fragment:

```ts
const ydoc = new Y.Doc();
const fragment = ydoc.getXmlFragment("document");

const editor = useCreateBlockNote(
  withCollaboration({
    schema,
    collaboration: {
      fragment,
      user: localUser,
    },
  }),
  [documentId]
);
```

The exact React lifecycle needs care: one document selection creates one replica
and one editor binding, and switching documents destroys both after
unsubscribing. `initialContent` must not seed competing local content; canonical
initial content is inserted once by main as a Yjs update.

Awareness and remote cursors do not need to ship in the first milestone. The
optional BlockNote provider is for awareness; document synchronization can use
Digest's own IPC transport around the supplied `Y.Doc`.

### Open and synchronize

```ts
type OpenDocumentRequest = {
  documentId: string;
  stateVector: Uint8Array;
};

type OpenDocumentResult = {
  document: DocumentRecord;
  access: "editable" | "read-only";
  update: Uint8Array;
};
```

Main should:

1. Resolve the sender to a live window session.
2. Validate that the document exists and belongs to an accessible profile.
3. Remove the sender's previous document subscription.
4. Set that window session's `selectedDocumentId`.
5. Add the sender to the named document's subscriptions.
6. Resolve the sender's access policy for the document.
7. Compute `Y.encodeStateAsUpdate(canonicalDoc, stateVector)` and return only
   the state missing from the renderer's replica.
8. Apply the returned update to the local `Y.Doc` with a distinct remote origin
   so it is not sent back to main.

The same handshake is used to recover after a renderer suspension, missed
notification, or reconnect: send the local state vector and apply the returned
diff. No BlockNote JSON replacement or application revision counter is needed
for convergence.

### Send an incremental update

```ts
type ApplyDocumentUpdateRequest = {
  documentId: string;
  updateId: string;
  update: Uint8Array;
};
```

The renderer listens to its local `Y.Doc`'s `update` event. Updates created by
local editor transactions are sent to main; updates applied with the remote
transport origin are not echoed.

Main serializes accepted updates per document and requires:

- The sender is subscribed to `documentId`.
- The sender has write access to the document.
- The update ID has not already been accepted.
- The binary update is valid for the document synchronization protocol.

Within that serialized pipeline, main validates the update, appends it to the
durable Yjs update log, applies it to the canonical `Y.Doc`, and publishes it to
the other subscribers. It acknowledges the producer only after the durable
append and canonical apply succeed. An authorization or validation failure
returns a typed rejection; it must not be silently treated as success.

Validation should apply the candidate to a temporary replica of canonical state
before persistence. That keeps an invalid binary update from entering the
durable log while avoiding mutation of the live canonical document before the
durable append.

Every accepted update should publish:

```ts
type DocumentUpdateAccepted = {
  documentId: string;
  updateId: string;
  producerRendererId: number;
  update: Uint8Array;
};
```

Other subscribers apply the binary update to their local `Y.Doc` with the
remote transport origin. The originating local replica already contains the
change, so it needs an acknowledgement rather than a block replacement.

Yjs updates are commutative, associative, and idempotent, so duplicate delivery
does not corrupt document state. `updateId` is still useful for request outcomes
and diagnostics. State-vector resynchronization is the repair mechanism for a
missed delivery.

An unauthorized local edit is different: once applied to a renderer's local
`Y.Doc`, a rejected Yjs update cannot be rolled back by applying canonical state.
Read-only mode must therefore prevent editor transactions, and any rejected
locally generated update must discard and recreate that window's replica from
canonical state before editing can continue.

### Concurrent updates

Main does not choose a winning renderer. It accepts authorized updates from all
subscribed editors into the same serialized persistence pipeline. Yjs resolves
concurrent text and structure transactions when replicas exchange the updates.

Application-originated mutations—clips, browser captures, plugin operations,
and LLM edits—must also transact against the canonical collaboration `Y.Doc`
and flow through the same persistence and publication path. They must not
replace the rendered BlockNote JSON alongside the collaboration protocol.

Undo remains window-local through BlockNote's Yjs undo integration: a window
undoes its own captured local transactions rather than reverting another
window's work.

### Close or navigate away

Window navigation and teardown should:

1. Remove the renderer from its current document subscription.
2. Cancel or reject queued renderer updates for the old document.
3. Leave the canonical document service alive according to normal application
   retention policy.

The renderer should finish or reject any in-flight update before requesting
navigation. Main's document ID, subscription, and authorization checks remain
the final safety boundary. Unlike the current two-second block-array debounce,
local Yjs updates should normally be forwarded immediately; short transport
batching can be added later without changing the protocol.

## Implementation stages

### Stage 1: Move selected document into `WindowSession`

- Add `selectedDocumentId: string | null` to each registered window session.
- Replace `documents:get-active` with a sender-scoped query.
- Make `documents:switch` update only the initiating window session.
- Change initial window loading to choose an explicit route document, then a
  startup default, without mutating other windows.
- Remove active-document fallbacks from document mutations and renderer helpers.
- Rename APIs from “active document” to “selected document” where their scope
  is a window.

Compatibility code may retain `DocumentManager.activeDocument` temporarily for
single-window startup, but no read, write, or notification in the multi-window
path may depend on it.

### Stage 2: Establish explicit document subscriptions

- Add an application-scoped `DocumentSubscriptionRegistry` containing renderer
  IDs, not `WebContentsView` objects.
- Add explicit subscribe, unsubscribe, and `releaseRenderer` operations.
- Resolve live targets through `WindowRegistry` when publishing.
- Make document loading subscribe the renderer and return its resolved access.
- Remove the direct recipient set from `BlockOperationService` after all
  publishers use the registry.
- Clean subscriptions from the existing window-close path.

This stage establishes a single delivery rule: document changes go only to live
subscribers of that `documentId`.

### Stage 3: Adopt the BlockNote collaboration representation

- Define the stable root `Y.XmlFragment` name and schema/version policy.
- Replace the main-process `Y.Array<any>("blocks")` representation with the
  representation written by BlockNote's collaboration binding.
- Build a migration that loads existing block history, constructs the current
  BlockNote JSON once, and inserts it into the new canonical collaboration
  document once.
- Create a window-local `Y.Doc` for each selected document and bind BlockNote
  with `withCollaboration`.
- Remove `editor.replaceBlocks` from synchronization.
- Ensure document switching destroys the old editor/replica/listeners after
  unsubscribe and does not reuse a fragment across document IDs.

This representation change should happen before multi-window update delivery.
Otherwise the project would build and then discard a second synchronization
protocol.

### Stage 4: Add the in-process Yjs provider protocol

- Add subscribe/resync with renderer state vectors and canonical state diffs.
- Forward local incremental updates with `documentId` and `updateId`.
- Apply remote updates with a transport origin that prevents echo loops.
- Serialize validation, persistence, canonical apply, acknowledgement, and
  publication per document.
- Store incremental Yjs updates durably and compact them into periodic
  snapshots.
- Resynchronize from state vectors after missed delivery or renderer resume.
- Recreate the local replica from canonical state after rejection of a locally
  generated update; do not try to undo it with a state-vector diff.
- Remove the two-second whole-document debounce and document-root replacement
  operations from editor synchronization.

### Stage 5: Route every document mutation through canonical Yjs

- Convert clips, browser captures, plugin operations, LLM edits, and document
  seeding into canonical Yjs transactions.
- Preserve producer identity as transaction metadata for diagnostics and local
  undo filtering.
- Remove remaining complete-document replacement paths.
- Make read-only access, if used, an authorization result rather than an editor
  ownership state.

### Stage 6: Exercise the real multi-window flow

Add an Electron integration scenario:

1. Open notebook D in window A and edit it.
2. Open a referenced webpage in window B.
3. Return window B to D.
4. Verify B's local replica converges to A's latest accepted state.
5. Edit the same paragraph concurrently in A and B.
6. Verify both replicas and main converge to the same document.
7. Undo in B and verify it undoes B's local transaction rather than A's edit.
8. Apply a clip or plugin mutation and verify both replicas receive it.
9. Navigate and close either window; verify the other remains correct.

Also cover separate notebooks being edited in parallel, renderer crashes,
subscription cleanup, unauthorized updates, duplicate updates,
state-vector recovery after a missed notification, and rapid route changes
during an in-flight update.

## Later extensions

The same representation and transport can later support:

```text
window-local Y.Doc + BlockNote binding
              ↕ incremental Yjs updates
main canonical Y.Doc and durable update log
              ↕
other subscribed window-local Y.Docs
```

- Awareness, presence, and remote cursors.
- Deliberate offline editing and reconnection.
- Cross-device or network providers.
- Per-user document authorization.

None of these requires replacing the editor binding, persistence format, or
document transport built by this plan.

## Invariants

1. Every document command names a `documentId`.
2. A window's selected document is never inferred from process-global state.
3. Navigating window A does not change window B's selected document.
4. Only subscribed renderers receive a document's updates.
5. Authorized updates from multiple windows converge through canonical Yjs.
6. An accepted Yjs update is durable before subscribers are notified.
7. Every open notebook editor is bound to its own window-local `Y.Doc`.
8. A delayed update cannot land on another document or be accepted after its
   producer unsubscribes.
9. Closing a window releases its subscriptions without destroying
   shared canonical state.
10. State-vector exchange can make any live replica converge with canonical
    state without replacing its rendered block array.

## Completion criteria

The milestone is complete when two real Digest windows can independently
navigate to notebooks, return from a webpage to the originating notebook, and
observe converged notebook state through independent local Yjs replicas;
simultaneous same-notebook edits converge across windows and main;
state-vector resynchronization repairs missed delivery; and delayed
cross-document writes are rejected rather than redirected.
