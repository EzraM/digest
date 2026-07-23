# Multi-Window Digest: Goal and Rough Edges

## Status

This is a problem-framing document, not an implementation plan.

It records the user experience we want, the assumptions that do not yet hold in
the current architecture, and the boundaries that should guide a later design.

## Motivation

The “open in new tab” action from a notebook currently does not produce a useful
result. In a desktop application, the natural interpretation of that action is
not a Chromium tab or an external browser. It is another Digest window.

A user should be able to:

1. Open a webpage referenced by a notebook in another Digest window.
2. Continue working in either Digest window independently.
3. Navigate the new window back to the originating notebook.
4. See the latest notebook state, including changes made from another window.

This should feel like two views into one application, not like two loosely
coordinated copies of the application.

## Product goal

Digest supports multiple native windows backed by one running application
process and one canonical set of user data.

Each window owns its own navigation and presentation state. The main process
owns shared document and persistence state. Opening, closing, or navigating one
window must not unexpectedly change another window.

The first useful experience is:

```text
Notebook window
    |
    | open referenced page in new Digest window
    v
Webpage window ---- Back ----> originating notebook at its latest version
```

The initial goal is not unrestricted real-time collaborative editing. We should
not claim that two windows can safely edit the same notebook simultaneously
until the write and synchronization protocol actually supports it.

## Desired semantics

### A Digest window is a view, not a data owner

A window owns:

- Its current route and navigation history.
- Its selected or visible document.
- Its native `BrowserWindow` and main application `WebContentsView`.
- Its browser placements: the slots in that window where a live browsing
  journey may be presented.
- Transient UI state such as sidebar visibility, focus, and bounds.

A window does not own:

- Documents or block history.
- SQLite persistence.
- The canonical Yjs document for a notebook.
- Profiles or the document tree.
- A browsing journey merely because it is currently presenting that journey.

### Browsing journeys can move between windows

A live browsing journey owns one Electron `WebContentsView`, its Chromium
history, and its current page runtime. It is an application-managed resource,
not permanently owned by the window where it was created.

A window owns the placement of a journey while that journey is visible. The
placement is exclusive: one live journey can be attached to at most one window
at a time.

This allows the following behavior:

1. A user opens a Jira ticket in window A.
2. The user returns window A to the notebook, detaching but retaining the Jira
   journey.
3. The user opens the same reference in window B.
4. Digest resolves the retained journey and attaches it to a placement in
   window B, preserving its history and live page state.

The journey has followed the user's request without being copied, reloaded, or
treated as part of window A.

If the Jira journey is still visible in window A when window B asks for the same
profile and URL, Digest must not steal it from A. The allocator should select
another suitable detached journey or create a new one for B.

This is similar to an exclusive lease:

```text
detached journey + request -> attach existing journey
visible journey + request  -> select another journey or create a new one
```

The lease is on a concrete journey, not on a URL. Several independent journeys
may have the same profile and current URL.

### Placements have globally unique identities

A placement is a registered presentation slot in one Digest window. Its
`placementId` should be globally unique and opaque for the lifetime of the
application session:

```text
placement-<uuid>
```

Main owns the authoritative registration:

```ts
type PlacementRecord = {
  placementId: string;
  ownerWindowId: string;
  ownerRendererId: number;
  state: "active" | "retired";
};
```

Window, route, document, reference, and layout are placement attributes or
current presentation state. They should not be encoded into the placement's
identity.

A placement ID is stable while a window reuses that presentation slot across
route transitions. Transition and mount generations still fence delayed work
within the slot. Closing the owning window permanently retires its placements;
their IDs are not reassigned to another window.

Global uniqueness lets application-facing commands stay small:

```text
present(reference, placementId)
```

The coordinator resolves `placementId` through the placement registry to find
the destination window and its presentation store. Commands do not need to
expose `windowId` separately.

Global uniqueness does not replace ownership validation. Main should verify
that the IPC sender owns an active placement before accepting its updates,
detach requests, bounds, or generations.

### Browser presentation is split across shared allocation and window stores

The current `ViewStore` combines two different ownership lifetimes and should
be split.

An application-scoped journey allocator owns the shared pool of browsing
journeys. It decides which eligible journey, if any, may satisfy a request and
reserves that journey while presentation is in progress.

Each window has its own presentation store. It owns that window's placements,
generations, bounds, z-order, native attachment effects, and renderer
notifications. It does not search the shared journey pool or decide that a
journey may be taken from another placement.

The application-facing command still asks to present a reference in a
placement. The caller does not decide whether that requires a cache hit, a
journey transfer, history selection, a fresh native view, or a URL load.

Conceptually:

```text
present(reference, placementId)
    -> resolve and validate the placement
    -> ask the shared allocator to select and reserve a journey
    -> ask the owning window store to perform native presentation
    -> commit the allocator reservation on success
    -> release or repair the reservation on failure
    -> acknowledge the resulting presentation
```

This orchestration may live in an application command handler or a small
presentation coordinator. It should not recombine the two stores into one
stateful object.

The lookup by `(profileId, normalizedUrl)` is cache-like, but it is an index over
candidate journeys rather than a map to one unique view. Suitability includes at
least:

- The profile matches.
- The journey or history entry can satisfy the requested reference.
- The journey is detached, or it is already attached to the requesting
  placement.
- Reusing it will not violate another window's visible presentation.

Candidate selection must filter for these hard constraints before ranking by
recency or reference affinity. If the newest matching journey is visible in
window A but an older matching journey is detached, a request from window B
should reuse the older detached journey rather than create a third one.

Planning and acquisition should be distinct but atomic from the perspective of
other requests. Once a request selects a detached journey, the journey enters a
reserved state before native effects begin:

```text
detached
    -> reserved(requestId, placementId)
    -> visible(placementId)    on success
    -> detached                on failure or cancellation
```

This is a state-machine lease, not a mutex managed by callers. It prevents two
overlapping requests from selecting the same detached journey while allowing
the native work to remain asynchronous.

### Existing ViewStore responsibilities have a migration destination

The current `ViewStore` already has useful allocator ingredients:

- Explicit route, placement, reference, profile, and generation identities.
- Separate journey, placement, and native handle identities.
- A `(profileId, normalizedUrl)` index that can contain multiple journeys.
- Planning and policy seams before Electron effects.
- One-to-one handle/placement invariants.
- Generation fencing for stale renderer work.
- Commit-after-attach behavior on cache reuse.
- Injectable effect, notification, event, operation, and registry ports.

Those are a foundation to extend rather than replace.

The split should assign them according to ownership:

```text
Application-scoped JourneyAllocator
├── journey catalog and URL/reference indexes
├── handle registry
├── allocation and reservation state
└── retention and eviction policy

Per-window PresentationStore
├── placement membership and generation fencing
├── BrowserWindow and ViewLayerManager
├── attach, detach, bounds, and layer effects
└── renderer notifications

Application-scoped placement registry
└── placementId -> owning PresentationStore
```

The placement registry resolves a globally unique `placementId` to the
appropriate window store. The window store verifies its local placement state
and performs native effects for a reservation selected by the allocator. It
never chooses a journey.

The allocator owns the cross-window exclusivity invariant. A window store
cannot attach an arbitrary handle; it receives an opaque reservation identifying
the journey and request it is allowed to present. Commit and release operations
must match that reservation so delayed outcomes from one window cannot mutate a
newer allocation.

Native effects should report explicit outcomes. Creation, attachment, and
detachment should support commit or compensation instead of updating logical
ownership merely because an effect was requested. The caller should eventually
receive a terminal result such as presented, unchanged, superseded, or failed.

### Opening a new window preserves context

The open-in-new-window command should carry a Digest route and the context
needed to return to the originating notebook. For a webpage opened from document
`D`, the new window should know both the webpage route and `D`.

This is an application command with explicit intent:

```text
Open this Digest route in another window.
```

It should not depend on the incidental behavior of an HTML `_blank` target,
although generic new-window requests may be intercepted as a fallback.

### Shared data is addressed explicitly

Every document read, write, subscription, and notification should identify its
`documentId`.

Main-process code must not infer the target of a mutation from whichever
document happens to be globally active. “Active document” is presentation state
and can differ between windows.

### Updates have an identifiable origin

An update should identify the renderer or window that produced it, in addition
to its semantic source. Producer identity must be derived or verified by main,
not trusted merely because it appears in a renderer payload:

```ts
{
  source: "user",
  windowId: "...",
  requestId: "..."
}
```

This lets the originating renderer suppress its own echo while other renderers
receive the change. Treating every user-originated update as local is incorrect
once more than one renderer exists.

### IPC is one ingress into an application message boundary

Before creating a second window, renderer IPC should stop behaving like a set
of methods bound to one captured renderer. Electron IPC is instead one producer
of typed messages entering a process-wide application dispatcher:

```text
renderer window ─┐
internal job ────┼──> ingress adapter ──> policy ──> dispatcher
future plugin ───┘          │
                            └──> bounded diagnostic history
```

The pipe is a logical application boundary. It does not require every message
to use one literal Electron channel, and it does not require all handlers or
services to become asynchronous event consumers.

Messages retain distinct semantics even when they share the boundary:

- A command asks the application to change something and has a terminal
  outcome.
- A query asks for current state and returns to the initiating producer.
- An event records something that has happened and may be delivered according
  to a subscription or targeting policy.

At ingress, main should schema-validate the message, resolve `event.sender`
through the window registry, stamp immutable producer context, authorize the
message type and referenced resources, and only then dispatch it. A renderer
may supply a `documentId` or `placementId`, but those are claims to validate,
not proof that it owns or may mutate the resource.

Conceptually, the trusted form has common metadata:

```ts
type ApplicationMessage<T> = {
  messageId: string;
  kind: "command" | "query" | "event";
  type: string;
  payload: T;
  producer: {
    kind: "window" | "browser-view" | "internal" | "plugin";
    id: string;
    windowId?: string;
    rendererId?: number;
    pluginId?: string;
  };
  context: {
    documentId?: string;
    placementId?: string;
    correlationId?: string;
    causationId?: string;
  };
  receivedAt: number;
};
```

The exact envelope should be designed with the command types rather than made
maximally generic up front. The important properties are typed payloads,
trusted provenance, explicit resource context, and correlated outcomes.

This boundary also creates a future plugin seam without requiring a plugin
runtime in the multi-window work. Different producers can use different
ingress adapters and authority policies while application handlers receive the
same authenticated command and query types. Provenance makes the intended and
observed blast radius of a producer understandable after the fact.

Main may retain a bounded, redacted history of recent messages, authorization
decisions, outcomes, durations, correlations, and causation. This history is
for debugging, not replay or recovery. It should exclude secrets and sensitive
payloads by message-specific policy, have a fixed memory bound, and normally be
cleared on restart.

## Current rough edges

The codebase is organized around one application window and one renderer. A
second window is therefore not just another call to `createWindow()`.

### The active document is process-wide

`DocumentManager` stores one `activeDocumentId`. Document switching and several
IPC handlers use it as the implicit target.

With two windows, navigating window A would change what window B considers
active. Worse, a delayed edit from B could be applied to the document most
recently selected in A.

### Block mutations do not name their document

The renderer sends block operations without a `documentId`.
`block-operations:apply` resolves the target through
`DocumentManager.activeDocument`.

This is safe only while there is exactly one independently navigating renderer.

### A document service can notify only one renderer

`BlockOperationService` stores a single `rendererWebContents` reference.
Attaching a second renderer replaces the first, so updates have one destination
rather than a set of interested windows.

Other services have similar single-renderer setters.

### Main-process callbacks target one global application view

`globalAppView` and closures around a single `rendererView` are used for
navigation, link capture, downloads, images, document-tree updates, and other
notifications.

In a multi-window application, each event needs an explicit delivery policy:

- Reply to the initiating window.
- Notify every window displaying a particular document.
- Broadcast application metadata to all windows.
- Target the window that owns a particular browser view or download.

“Send to the Digest renderer” is no longer a sufficient policy.

### IPC setup assumes one renderer

IPC handlers are global to the Electron main process but are currently created
with one renderer captured in their closures. Registering the same handlers
again for a second window would cause handler collisions and would still leave
ambiguous routing.

Handlers should be registered once as ingress adapters. They should resolve the
calling window from `event.sender`, stamp trusted producer context, validate
resource ownership, and dispatch without capturing a renderer as the implicit
request or response target. Replies should return to the initiating sender;
subsequent notifications should follow an explicit delivery policy.

### Browser presentation is tied to one containing window

`ViewStore`, `ViewLayerManager`, bounds, z-order, and native
`WebContentsView` attachment are constructed for one `BrowserWindow`.

Bounds, z-order, and native attachment are necessarily window-scoped. Journey
lookup, retention, URL/reference associations, recency, capacity, and exclusive
allocation may need to be application-scoped so a detached live journey can
move between windows.

The current `ViewStore` therefore needs to split into an application-scoped
journey allocator and one presentation store per window. The allocator owns
journey selection, retention, and reservations. The window store owns
placements and all effects that require a containing `BrowserWindow`.

### Journey selection and acquisition are not yet general

The current journey planner selects the most recent URL match and only then
checks whether that journey is detached. A visible recent match can therefore
force creation even when another matching detached journey is reusable.

Planning also observes a detached journey without reserving it. This is
sufficient while one synchronous, single-window path controls all attachment,
but it is not a complete acquisition protocol for overlapping requests from
multiple windows.

Native creation and detachment do not consistently return outcomes to the
coordinator, and the renderer uses fire-and-forget IPC for presentation
requests. The multi-window design needs explicit reservation, commit/release,
and terminal acknowledgement while preserving the existing public intent.

### Yjs is canonical storage, but not yet a multi-renderer protocol

Digest has one Yjs document per Digest document in the main process. That is a
useful foundation, but Yjs does not automatically make the renderer behavior
concurrency-safe.

Current editor saves:

- Are debounced for two seconds.
- Send the complete BlockNote document as a document-root update.
- Replace the complete Yjs block array.
- Broadcast a complete block array back to a renderer.

Two editors can therefore begin with the same state, make different changes,
and submit competing whole-document replacements. The later replacement can
erase the earlier edit. This is last-writer-wins behavior around a Yjs data
structure, not collaborative merging.

The renderer also skips updates based on `origin.source === "user"`. In a
multi-window system it must skip only its own acknowledged update, not edits
made by a user in another window.

The proposed simplification is to use Yjs as the editor synchronization
protocol rather than wrapping it in whole-document operations:

```text
BlockNote editor
    ↕ direct binding
window-local Y.Doc
    ↕ incremental Yjs updates over IPC
main-process canonical Y.Doc
    ↕ immediate update persistence
SQLite
```

BlockNote should bind directly to a Yjs collaborative fragment in a
window-local `Y.Doc`. Local edits update the editor and its Yjs replica
synchronously, so typing does not wait for IPC or SQLite. The window sends the
resulting incremental Yjs update to main with an explicit `documentId` and
originating message identity.

Main acts as the in-process Yjs provider:

1. Resolve the named document and validate the sender's current edit ownership.
2. Apply the update to the canonical main-process `Y.Doc` in that document's
   serialized update pipeline.
3. Immediately append the accepted update to SQLite.
4. Forward it to the other subscribed renderers.
5. Acknowledge the originating message only after persistence succeeds.

A persistence failure is terminal for that update pipeline and must not produce
a success acknowledgement or a broadcast. Main should repair or reload that
document from durable state before accepting further edits, rather than
continuing with an unpersisted canonical state.

Durable persistence does not need the current two-second debounce. SQLite
should append each accepted Yjs update as it arrives. This keeps the persisted
state close to the acknowledged canonical state and removes delayed
whole-document writes from window navigation. If measurement later shows that
transactions are too frequent, adjacent updates may be grouped over a very
short transport interval without changing the protocol or making the editor
wait.

Snapshots remain useful as storage compaction and startup acceleration, not as
part of the editing loop. Startup loads the latest Yjs snapshot and applies the
small tail of persisted Yjs updates after it. A window that subscribes or
resubscribes sends its Yjs state vector and receives the missing encoded state;
it does not replay BlockNote edits or replace the complete rendered document.

This requires replacing the current `Y.Array<any>` of opaque block JSON with
the Yjs representation used by BlockNote's collaboration binding. Deleting and
reinserting a complete JSON block array cannot provide useful text-level merge
semantics.

The first multi-window release may still enforce one live editor per document.
Other windows can subscribe read-only and receive Yjs updates. The same
provider protocol then leaves a direct path to concurrent editing later,
without another persistence or synchronization redesign.

### Delayed writes can cross navigation boundaries

Because saving is debounced and the operation has no `documentId`, a user can
edit a notebook, navigate, and have the delayed operation applied after the
process-wide active document has changed.

Multi-window support makes this existing ambiguity more likely and more
damaging, but does not create it.

### Application initialization and window creation are interleaved

The current window creation path also registers and initializes application
services, installs IPC handlers, configures shared callbacks, and creates
window-specific presentation services.

Multiple windows require a clean separation:

```text
start application once
    -> initialize shared services once
    -> register IPC once
    -> create zero or more window sessions
```

## Minimal sound model

The smallest model that does not hide these ownership problems is:

```text
Application process
├── canonical documents: documentId -> document service / Y.Doc
├── window registry: renderer sender -> window session
├── typed message dispatcher and ingress policy
├── bounded, redacted diagnostic message history
├── placement registry: placementId -> owning PresentationStore
├── document subscriptions: documentId -> set of renderer senders
└── JourneyAllocator
    ├── browsing journeys and live-page lookup indexes
    └── exclusive journey-to-placement reservations

Window session
├── BrowserWindow
├── application WebContentsView
├── current route and documentId
├── PresentationStore
│   ├── browser placements and generations
│   ├── ViewLayerManager
│   └── native attachment, bounds, and z-order effects
└── window-local transient state
```

The important separation is:

> Shared user data is application-scoped. What the user is currently looking at
> is window-scoped.

## Prerequisite: establish the application message boundary

The first implementation phase should establish the process-wide message
boundary while preserving current single-window behavior. This is a
prerequisite to creating a second window because the later window registry,
resource routing, and subscription work all depend on having trustworthy
producer context.

The phase should:

- Register application IPC handlers once per process.
- Route renderer commands and queries through a typed dispatcher.
- Derive renderer and window identity from Electron's sender.
- Validate payloads and referenced resource ownership before dispatch.
- Keep command, query, and event semantics distinct.
- Return command outcomes and query results to the initiating sender.
- Remove renderer instances captured as implicit request or response targets.
- Provide correlation and causation metadata where workflows span messages.
- Retain a bounded, redacted recent history for diagnosis.
- Permit existing IPC channels to migrate incrementally behind the boundary.

The phase does not require event sourcing, durable message storage, replay,
rewriting every service around events, implementing plugins, or collapsing all
IPC traffic onto one Electron channel.

It is complete when the application still works with one window and tests with
distinct synthetic senders demonstrate that:

- Each message resolves the correct window context.
- Results return to the initiator.
- Cross-window resource claims are rejected.
- Handler registration remains process-wide.
- Diagnostic records preserve provenance and outcomes without retaining
  prohibited payload data.

## Proposed first boundary

The first release should support multiple windows without promising concurrent
editing of the same notebook.

It should allow:

- Multiple Digest windows.
- Independent routes and navigation histories.
- A webpage to open in a new Digest window.
- The new window to return to the originating notebook.
- A notebook opened later to load the latest canonical state.
- Different notebooks to be edited in different windows, once writes name their
  document explicitly.

For the same notebook, the first release should enforce or clearly model one
live editor at a time. Another window may navigate back to it and take over or
show a read-only view, but the ownership transition must be explicit.

This boundary avoids turning whole-document replacement into an accidental
distributed editing protocol. It also leaves a straightforward path to genuine
multi-editor support later.

## Invariants

Any implementation should preserve these invariants:

1. Navigating one window does not navigate another window.
2. Every document mutation names its target document.
3. Closing a window does not destroy shared document state needed by another
   window.
4. A native browser view belongs to exactly one containing window at a time.
5. Every active placement ID resolves to exactly one owning window, and a
   renderer can mutate only placements it owns.
6. Retired placement IDs are never reassigned to another window.
7. A detached browsing journey may be attached to a different window without
   losing its history or live runtime state.
8. A request cannot take a visible journey away from another placement; it must
   select or create a different journey.
9. At most one active request holds the reservation for a journey.
10. Candidate selection ranks only eligible journeys; an in-use recent match
    cannot hide a reusable detached match.
11. A renderer receives only events addressed to it or to a subscription it
   currently holds.
12. An old or delayed request cannot be redirected by a newer navigation.
13. Application services and IPC handlers are initialized once per process.
14. Window-specific resources are released when their owning window closes.
15. The application does not advertise concurrent editing stronger than the
    synchronization protocol can guarantee.
16. Every external operation enters through an ingress that derives trusted
    producer identity; producers cannot grant themselves window or resource
    authority through payload metadata.
17. Application handlers do not capture a renderer as their implicit request
    source or response destination.
18. Only the application-scoped allocator selects or reserves a shared journey;
    a window presentation store performs native effects only for a valid
    reservation addressed to one of its placements.

## Failure modes to design against

- Window A changes the globally active document while window B has a pending
  debounced save.
- Opening window B replaces window A as the only document-update recipient.
- A browser page created for one window is attached, resized, or removed by
  another window's route transition.
- A cache lookup returns a journey that is already visible in another window,
  and attaching it implicitly steals the page from that window.
- `(profileId, normalizedUrl)` is treated as a uniqueness constraint, preventing
  two windows from independently displaying the same URL.
- The most recent URL match is visible, so the allocator creates a new journey
  without considering an older detached match.
- Two requests observe the same journey as detached before either has committed
  its attachment.
- Two windows use the same renderer-local placement name and their generations
  or native effects collide.
- A renderer sends commands for a globally valid placement owned by another
  window.
- Native attachment fails after logical allocation has already been committed,
  leaving the journey unavailable or attached to no window.
- Closing the most recently opened window clears a global renderer reference
  still needed by another window.
- A download, clip, or link-capture event is delivered to whichever window was
  created last rather than the window that initiated it.
- A user edit from window A is ignored by window B because both are classified
  only as `source: "user"`.
- Two simultaneous whole-document saves silently discard one user's changes.
- Creating a second window re-registers global IPC handlers or reinitializes
  singleton services.
- A renderer or future plugin supplies another window's identity in its payload
  and is trusted without checking the authenticated producer.
- Diagnostic message history captures document content, credentials, clipboard
  data, or other sensitive payloads that were not approved for retention.

## Questions for the implementation design

- What exactly does the Back action mean in the new window: ordinary route
  history, or an explicit return-to-origin command?
- Should a second window attempting to edit an already-open notebook focus the
  existing editor window, open read-only, or transfer edit ownership?
- Which application events are true broadcasts, and which should be scoped to
  an initiating window, document subscription, or browser-view owner?
- Should window routes and bounds be restored after application restart, or is
  multi-window state initially session-only?

## Non-goals for the first version

- Cross-device or network synchronization.
- Multiple Electron main processes sharing one SQLite database.
- Unrestricted simultaneous editing of the same notebook.
- Persisting and restoring an arbitrary multi-window workspace.
- Treating external browser tabs as Digest windows.
- Event sourcing, durable IPC message storage, or replay-based recovery.
- Building a plugin runtime as part of multi-window support.

## Success criteria

The first version is successful when:

1. “Open in new window” reliably opens the referenced webpage inside another
   Digest window.
2. Both windows remain independently navigable and usable.
3. The new window can return to the originating notebook and load its latest
   committed state.
4. Editing or navigating in one window cannot redirect a write or native view
   operation in another.
5. Same-document edit ownership is explicit rather than accidentally
   last-writer-wins.
6. Closing either window leaves the other in a valid, usable state.
