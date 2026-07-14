# Clip Architecture Plan (BlockNote-first, browser-aware)

## Summary

Clipping is a **pipeline** from “user selection in a browser WebContents” → “a clean BlockNote block tree inserted into the notebook”, with a review/edit step.

Key decisions:
- **Do not persist selection HTML** in the notebook document.
- **One selection → many blocks** (headings/paragraphs/lists/images/tables), so the conversion output is a **BlockNote block array/tree**, not a single blob field.
- The clipper UI should offer a **small, isolated BlockNote instance** to preview/edit the proposed blocks before insertion.
- HTML → blocks conversion should start **deterministic**; **LLM-assisted conversion is deferred** behind a service abstraction.

## Goals

- Turn an on-page selection into a **high-quality** set of BlockNote blocks with:
  - readable structure (headings, paragraphs, lists)
  - preserved images when available/allowed
  - provenance (source URL/title/captured time)
- Provide a **review/edit** step that is fast and predictable.
- Keep the existing architecture constraints intact:
  - multi-WebContents (browser view vs renderer vs HUD)
  - SQLite/Y.js + `BlockOperationService` remain the persistence source of truth
  - shared browser session partition is used for reopening sources

## Non-goals (for bootstrap)

- Perfect reconstruction of the page DOM
- Capturing full-page context outside the selection (beyond minimal “expand selection” heuristics)
- Re-highlighting the same selection when reopening (DOM paths/anchors can be added later)
- Server-side clipping / remote storage

## Reality constraints (why clipping is hard)

Selections are frequently “messy”:
- The selected HTML may contain deeply nested spans, ads/inline widgets, invisible elements, or broken structure.
- The selection may omit required context (e.g. a heading above the selection), requiring **backtracking** into surrounding DOM.
- Different sites produce wildly different markup and CSS-driven layout; “copy HTML” is not stable.

This matches the classic Evernote-style clipping problem: a long tail of edge cases if we pursue purely heuristic DOM cleanup.

## Architecture overview

**High-level data flow**

1) **Capture** (main process, browser WebContents)
- Capture selection payload (text + HTML + minimal context metadata).

2) **Draft** (renderer/HUD)
- Create a “clip draft” record and show it in a sticky panel/inbox UI.

3) **Convert** (renderer-side service, deterministic first; optional LLM)
- Convert the selection payload into a proposed BlockNote block tree.

4) **Review/edit** (renderer)
- Render the proposed blocks in a small BlockNote editor instance for quick edits.

5) **Commit** (renderer → main)
- Convert the final proposed blocks into block operations and insert into the active document via existing apply-ops IPC.

## Data model

### ClipDraft (transient; not persisted into the notebook doc)

The draft is an internal object used for conversion + review:

- **id**: unique id
- **sourceUrl**: page URL
- **sourceTitle**: page title (best-effort)
- **capturedAt**: epoch ms
- **selectionText**: plain text (best-effort)
- **selectionHtml**: raw selection HTML (best-effort)
- **context**: optional minimal hints (frame URL, selection rect, etc.)
- **conversion**: status + logs + chosen strategy (deterministic vs LLM)
- **proposedBlocks**: BlockNote block JSON for preview/edit (once converted)

Draft storage (bootstrap):
- Keep in-memory in the renderer (and/or persisted in SQLite later if we want drafts across restarts).

### Persisted result in the notebook document

We want provenance without storing raw HTML.

Proposed structure:
- Insert a **`clip` container block** with provenance props and children blocks for content.
  - `clip` block props (for now): **`sourceUrl`** + **`title`**.
  - `clip` block children: standard BlockNote blocks (paragraph/heading/list/table/image/etc).

Why a container:
- Encodes “this was one clip action” while still supporting “one selection → many blocks”.
- Lets us render a compact clip header/provenance line and keep the content as native blocks.

## IPC surface (proposal)

We already have a multi-hop architecture (main ↔ renderer ↔ HUD ↔ browser views). Clipping follows the same pattern.

### UI surface: notification panel that does not overlap

If the clip inbox/notification is implemented as a **layout-reserving panel** (top or bottom) that **pushes the page content** rather than floating above it, we avoid WebContents z-order problems entirely:
- Browser views remain confined to their measured containers.
- When the panel opens/closes, containers resize; existing browser bounds syncing naturally follows.

This also supports the direction of **moving away from the HUD**: the panel can live fully inside the main renderer tree.

Implementation note (how it works today, and what to reuse):
- **State**: `BlockNotificationContext` tracks `pendingBlockIds`.
- **Layout reservation**: `RendererLayout` watches `pendingBlockIds.length` and animates the notebook’s scroll container via `marginBottom` (currently a fixed `NOTIFICATION_HEIGHT`).
- **Notification lifecycle**: `BlockNotificationContainer` renders `SiteBlockNotification`; `SiteBlockNotification` runs a CSS animation and calls `removeNotification(...)` on `animationend`.

To make this reusable for clipping:
- Extract a small “notification surface” pattern that owns:
  - **queue state** (pending items),
  - **inset height** (prefer measuring the rendered panel height over a hard-coded constant),
  - **lifecycle** (auto-dismiss vs persistent).
- Then both “site opened” and “clip inbox” can plug into the same surface: the layout reserves space, and the surface controls how/when it appears.

### From browser WebContents to renderer

- **Event**: `browser:selection`
- **Payload**: `ClipDraft`-like selection payload (no blocks yet)

Main responsibilities:
- Acquire selection HTML/text from the browser WebContents (best-effort; see capture strategies below).
- Emit the event to the renderer so the UI can enqueue a draft in the sticky panel.

### From renderer to main (commit)

- Reuse existing `applyBlockOperations` path:
  - renderer generates block operations inserting the `clip` container (and its children)
  - send operations via `window.electronAPI.applyBlockOperations`
  - main persists via `BlockOperationService` (SQLite snapshots + Y.js sync)

## Capture strategies (bootstrap)

We should treat selection capture as **best-effort** and not block the pipeline on perfection.

Candidate strategies:

- **Execute JS in the page** (preferred for fidelity):
  - `window.getSelection()` → range(s)
  - serialize HTML via `Range.cloneContents()` into a container and read `innerHTML`
  - extract text via `Selection.toString()`
  - (optional) capture surrounding heading candidates by walking ancestors/previous siblings

- **Fallbacks**:
  - If HTML capture fails, proceed with text-only; conversion yields paragraphs/lists heuristically.

## Conversion: HTML/text → BlockNote blocks

### Principle: “canonical blocks”, not “stored HTML”

We accept that raw HTML is noisy. The output must be a clean block tree compatible with the current BlockNote schema so:
- editing is native
- persistence is unchanged (operations/snapshots)
- rendering is stable across restarts

### Deterministic path (cheap, fast)

Pipeline (suggested):

1) **Normalize/sanitize HTML**
- Remove scripts/styles/irrelevant attributes.
- Collapse spans/div soup where possible.
- Preserve meaningful structure: `h1–h6`, `p`, `br`, `ul/ol/li`, `table`, `img`, `pre/code`, `blockquote`, `a`.

2) **Convert DOM → block candidates**
- Headings → heading blocks
- Paragraph-ish nodes → paragraph blocks (split on hard breaks)
- Lists → list item blocks
- Tables → table blocks (if supported; otherwise degrade)
- Images:
  - capture `src` URLs
  - resolve to bytes later via existing image pipeline (see “Images”)

3) **Post-process**
- Merge/split paragraphs for readability
- Trim boilerplate (e.g. excessive whitespace)
- Limit depth/size for safety

This deterministic path should be the default for:
- relatively clean selections
- known/simple sites
- text-only clips

### LLM-assisted path (deferred)

We expect messy selection HTML to have a long tail of edge cases, but for now we’ll ship deterministic conversion and revisit LLM assistance later.

When we bring it back:
- Put the LLM behind a **service abstraction** (plugin-like), so the clipper depends on the service, not a concrete model/provider.
- Keep the interface “HTML/text → Block[]” with strict validation and safe limits.

## Review/edit UX (BlockNote-in-BlockNote, but isolated)

We want the user to see the clip in the shape it will land: headings/paragraphs/images, editable.

Proposal:
- Create a **mini BlockNote editor instance** in the clip panel for each active draft (or one at a time).
- Use the same schema as the main editor (plus the `clip` container spec).
- Edits mutate the draft’s `proposedBlocks`, not the notebook document.
- On “Insert”, we translate `proposedBlocks` → operations and insert into the real document.

Why isolated:
- Avoid polluting the main doc with half-baked clips.
- Keep conversion/editing latency decoupled from document sync/debounced persistence.

## Images

We already have an image architecture direction (`digest-image://…` protocol + SQLite `images` table).

Image policy (for now): **always local ingestion**.

- Draft preview may temporarily display external `src` URLs (best-effort).
- On commit, ingest images into SQLite via IPC (`ImageService`) and store only `digest-image://<id>` in the inserted blocks.

## Milestones

### Milestone 1: Text-only clip (deterministic)
- Capture selection text + best-effort HTML
- Draft inbox panel
- Deterministic conversion → proposed blocks
- Mini BlockNote preview/edit
- Commit inserts `clip` container + children

### Milestone 2: Image support in clips (local-first)
- Ingest images to local DB and commit as `digest-image://…`
- Thumbnail/provenance rendering improvements

### Milestone 3: Context expansion / backtracking
- Optional DOM backtracking for headings/captions
- Optional “expand selection to include context” UX

### Milestone 4: LLM-assisted conversion (future)
- Add LLM service abstraction + plugin-like provider wiring
- Add validation + fallback
- Add logging (strategy, latency, failures)

## Observability & guardrails

- Log each clip pipeline stage:
  - capture ok/fail
  - conversion strategy chosen
  - conversion latency + output size
  - commit success/failure
- Enforce limits:
  - max HTML size sent to converter/LLM
  - max blocks inserted per clip
  - safe URL allowlist / scheme checks

## Apply Block Operations (current flow + review)

### Current flow (today)

This is the path we’d use for clipping commits (and it’s also the path for user edits):

1) **Renderer**: `useDocumentSync` debounces and calls `window.electronAPI.applyBlockOperations([operation], origin)`
  - Today it emits a single `"update"` op with `blockId: "document-root"` and includes the **entire document** as `operation.document`.
  - It also forwards BlockNote `getChanges()` as `operation.changes` (used for image cleanup).

2) **Preload**: `ipcRenderer.invoke("block-operations:apply", operations, origin)`

3) **Main IPC**: `blockHandlers.ts` routes `"block-operations:apply"` to `BlockOperationService.applyOperations(...)`
  - It uses `operation.changes` to pre-delete images for deleted blocks.

4) **Persistence + sync**: `BlockOperationService`
  - Persists each op to SQLite
  - Applies to a Y.js array `blocks`
  - Broadcasts `document-update` to the renderer with the **full blocks array** + origin metadata

5) **Renderer**: `useDocumentSync` receives `document-update` and calls `editor.replaceBlocks(...)`, using a flag to avoid writing the update back to main.

### Experts review (what to improve during clip work)

Using the `docs/runbooks/experts-review.md` rubric:

- **Rich Hickey (simplicity, values)**:
  - The system already has a clean “values” shape: `apply(ops, origin)` and event-sourced persistence + snapshots.
  - The main complexity leak is the **document-root replace**: it smuggles a full state snapshot through an “operation” interface, making the model less crisp.

- **Erik Normand (composition, data vs derived data)**:
  - Event log + snapshots is a good separation (ops = source data; snapshots = derived).
  - But writing full `document` arrays as “ops” mixes state and change. It reduces composability and makes it harder to reason about conflicts/merges later.

- **Alan Kay (notation)**:
  - The minimal notation is essentially:
    - \( \texttt{apply(ops, origin)} \rightarrow \texttt{persist(ops)} + \texttt{ydoc := ydoc ⊕ ops} + \texttt{broadcast(state)} \)
  - A “replace whole doc” op is a different algebra than “small ops compose”; it increases the notation surface.

- **Paul Graham (people want)**:
  - For clipping, users want **quality** and **speed**. Shipping the full document on every edit risks scaling issues that show up as latency/jank before clipping feels “instant”.

### Proposed improvements (small, high-leverage)

These are incremental, and they specifically help the clipper because clipping wants to insert a *tree of blocks* cleanly and predictably:

1) **Switch renderer persistence from “document-root update” → granular ops**
  - Use BlockNote’s `getChanges()` + `BlockNoteOperationConverter` to emit `insert/update/delete/move` ops.
  - This removes JSON-diffing (`JSON.stringify`) and makes ops genuinely composable.

2) **Make `origin` a first-class value**
  - Create a single `origin` per debounced batch (and reuse its `batchId/requestId`).
  - Avoid generating multiple `Date.now()`-based IDs per field; treat origin as the stable envelope.

3) **Keep full-state broadcasts as an implementation detail (for now)**
  - Broadcasting `blocks` is okay early, but once ops are granular, we can later consider broadcasting *ops* (or Yjs update bytes) to reduce payload sizes.

If we do only (1) and (2), the flow becomes much simpler *and* it’s a direct enabler for clipping commits (clip insertion is naturally “insert many blocks” operations).

## Decisions (for now) + open questions

- **Clip block spec (for now)**: store **only** `title` + `sourceUrl`; render a light frame around the clip and a footer line like `see <a href=sourceUrl>title</a>`.
- **Draft persistence (for now)**: drafts are **in-memory only**.
- **Image policy (for now)**: **always local ingestion** (`digest-image://…`).
- **LLM (for now)**: defer; when revisited, define an **LLM service** (plugin-like) and have the clipper depend on the service interface.


