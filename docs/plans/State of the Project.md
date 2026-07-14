Digest Architecture (grounded in the current app)

## Reality check: what we run today
- Electron with multiple WebContents: main renderer (`persist:main-app`), HUD/app overlay (separate WebContentsView), and per-page browser views (`persist:shared-browser-session`). Z-order managed by `ViewLayerManager`; creation/removal and bounds via `ViewStore`, `useBrowserViewUpdater`, `useSize`.
- Editor: BlockNote with custom schema (site, Google, ChatGPT, URL blocks) rendered in React. Slash commands bridged through HUD (`SlashCommandManager`, `useSlashCommandBridge`).
- Data: Y.js document per Digest document. Changes persisted as block operations to SQLite via `BlockOperationService` (operations/snapshots/documents tables; profiles + document tree added in migrations 001–004). `DocumentManager` owns active document, tree, profiles, and BlockOperationService instances. `useDocumentSync` debounces renderer changes and calls `window.electronAPI.applyBlockOperations`.
- Rendering constraints: multi-WebContents coordination (IPC chain main ↔ renderer ↔ HUD ↔ browser views), focus/z-order rules from functional constraints. Browser views are positioned by measuring React containers and destroyed on unmount. Main app partition is separate from browser session.
- Current UX: inline SiteBlock for pages; notification when a page opens in the background; slash commands create URL/Google/ChatGPT blocks. Persistence is local SQLite; no clipping yet.

## Core abstractions (data, view, control)
- Document & block model: BlockNote document lives in Y.js; serialized block operations stored in SQLite. Profiles/doc tree metadata live in SQLite (`documents`, `profiles`), with snapshots for fast reloads.
- Block operations: `BlockNoteOperationConverter` maps BlockNote changes → operations with provenance; `BlockOperationService` applies them, persists to SQLite, snapshots, and broadcasts to renderer.
- Browser host: `Page` + `useBrowserInitialization`/`useBrowserViewUpdater` create/destroy WebContentsViews and sync bounds/URL. Shared browser session keeps cookies/auth; renderer/main stay isolated.
- HUD/overlay: `AppOverlay` provides slash menu/controls in its own WebContentsView; must keep focus coordination with the main renderer.
- IPC surface: `IPCRouter` + handler maps (`blockHandlers`, `browserHandlers`, `documentHandlers`, `slashCommandHandlers`) expose operations, doc tree, browser lifecycle, and slash commands to the renderer.

## Clip architecture plan (BlockNote-first, browser-aware)
- Block schema: add a `clip` block to the BlockNote schema with props for `sourceUrl`, `title`, `selectionText/html`, `selectionPreview`, `imageUrls`, `capturedAt`, optional `blockIdFromPage`, and provenance metadata. Keep fidelity to supported block types (paragraphs, headings, lists, tables, images) so clipped content maps cleanly into the existing schema. Renderer shows compact preview with “open source” (reopens the page via `navigateToBlock`/browser view).
- Flow (milestone 1: text selection from full-page view):
  - Capture selection inside a full-screen browser view (`Page` with `layout="full"`). Use WebContents selection APIs in the main process to read text/HTML + bounding info.
  - Emit IPC event (`browser:selection`) → renderer. Renderer shows a sticky notification panel (similar to existing BlockNotification patterns) instead of a transient toast; list pending clips with source URL/title.
  - Accept clip → `ClipInserter` converts raw selection into a `clip` block and inserts it after the focused block via BlockNote/BlockInserter. Persist through `applyBlockOperations` so SQLite/Y.js stay the source of truth.
  - Display: clip block renders normalized text excerpt, provenance line, and a button to reopen the original page (opens browser view with saved URL/blockId).
- Flow (milestone 2: images): extend selection capture to include image URLs/data URLs; allow “clip image” alongside text. Same notification + insertion path; block props gain `imageUrls`/`thumbnail`. (Dependency: ship image support before broader schema work.)
- Future (LLM extraction): from a full-page view, prompt an LLM tool to pull structured fields (e.g., ebay title/image/price). Agent operates via the command tooling (below), returns structured JSON, and we render it as a clip block or a table of clip blocks. Keep provenance (`sourceUrl`, `requestId`).
- Constraints:
  - Multi-WebContents: selection capture runs in browser WebContents; insertion runs in renderer; persistence runs in main. Plan the IPC chain and timing.
  - Layering: sticky panel must live in renderer/HUD layers so it stays above browser views (use `ViewLayerManager` overlay layer).
  - Sessions: clips should reopen pages using the shared browser session so auth/cookies persist.

## Notification UX (shared)
- Build a reusable notification component that animates up from the bottom and temporarily resizes the content area. It should be usable by both the existing block notification and the clipper.
- By resizing instead of overlapping, WebContents stacking conflicts go away (no webview overlap with the notification).
- Live in renderer/HUD layers; keep animation and positioning deterministic so IPC timing does not cause jank.

## Commands architecture plan (ranking across sources)
- Problem shape: multiple sources (existing slash aliases, notebook blocks, web searches, future tools) respond to one query; we need global ranking without regressing current speed.
- Baseline sources:
  - Deterministic aliases: exact `/g`, `/gh`, etc. map to existing slash command handlers and open the right block/browser view immediately (no model wait).
  - Notebook index: reuse `DocumentManager` + persisted operations to search titles/blocks (start with simple text search; add SQLite FTS/embeddings later, extracting only the text we care about).
  - Web/open-page: existing URL/Google/ChatGPT blocks; quick opens via `createBrowserBlock`.
- Command router (new abstraction):
  - Input: query string + context (current selection, focused block, active document/profile).
  - Output: ranked `CommandResult` objects with `source`, `score`, and an executable `action` (block insertion, open page, run search, run agent plan).
  - Implementation: pluggable source adapters (aliases, notebook search, web search, LLM intent mapper). Each scores its candidates; router merges by score/time and streams to HUD.
- Result execution:
  - Insert/update blocks through BlockNote operations (JSON canonical form). For agents that materialize tables/blocks, emit operations via `BlockOperationService`; consider optional Markdown mirror for token efficiency but keep BlockNote as source of truth.
  - Opening pages stays on the browser stack (`ViewStore`/`createBrowserBlock`).
- Agents (future):
  - Treat router sources as tools. Planner chooses a sequence: search ebay → extract clips (LLM tool) → write a table into the notebook.
  - Use structured tool responses to keep provenance (`requestId`, `sourceUrl`) so BlockOperationService can persist and Y.js can sync.
- Guardrails/transitions:
  - Keep the current slash-menu UX intact for known commands; new router results appear alongside with clear “AI” labeling.
  - Logging/observability: capture intent → action decisions and latency (hook into `debugEventService`).
  - Error handling: degraded mode without LLM still returns alias + notebook/search results.

## Open questions / next decisions
- Clip block design: how much HTML to keep vs. normalize to text? Do we capture DOM paths for re-highlighting on reopen?
- Notification UX: reuse SiteBlockNotification styling or build a unified sticky inbox for clips + command/agent outputs?
- Notebook search: start with simple SQLite text search over serialized blocks vs. introduce FTS5 early.
- Markdown mirror: likely defer; treat it as derived data the base abstractions can support later, not required for initial agent work.
