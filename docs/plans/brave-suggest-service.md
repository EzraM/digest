# Plan: Brave Suggest Service

## Goal

Integrate **Brave Search Suggest API** with the **workspace UI** so the workspace shows one combined list: slash commands, in-doc search results, and Brave query suggestions. The API key is read via `getEnvVar("BRAVE_API_KEY")` with **no default**; when the key is missing or empty, the suggest feature is disabled (no requests, no fallback). Results from all sources are merged into a **single ranked list** (e.g. by source priority: slash → notes → suggest).

---

## Current State

- **Search today**: In-document block search via `search.execute` (FTS5 / SearchIndexManager). Used in WorkspaceBlock for slash-command search.
- **Environment**: `src/config/environment.ts` exposes `getEnvVar(key, defaultValue?)`. No code currently uses it for API keys; `.env.local` is documented in CLAUDE.md for `ANTHROPIC_API_KEY` only.
- **Brave Suggest API**: External autocomplete endpoint, separate from in-app block search.

---

## Brave Suggest API (reference)

- **Endpoint**: `https://api.search.brave.com/res/v1/suggest/search`
- **Auth**: Header `X-Subscription-Token: <API_KEY>`
- **Query params**: `q` (required), `country` (e.g. `US`), `count` (e.g. 5), optional `rich=true` (paid)
- **Response**: `{ type: "suggest", query: { original: "..." }, results: [ { query: "..." }, ... ] }`
- **No confidence/score**: Brave Suggest does **not** return a confidence level or score per result. Each result has `query` and optionally (rich) `is_entity`, `title`, `description`, `img`. We assign a synthetic normalized score (e.g. position-based) for ranking.

---

## Proposed Design

### 1. API key

- **Key name**: `BRAVE_API_KEY`
- **Source**: `getEnvVar("BRAVE_API_KEY")` — no second argument (no default).
- **Behavior**: If the value is empty or missing, the suggest service does not call Brave; it returns an empty list (or the handler returns `[]`). No mock, no fallback provider.

### 2. BraveSuggestService (main process)

- **Location**: `src/domains/search/services/BraveSuggestService.ts` (or `src/services/BraveSuggestService.ts`).
- **Responsibility**: Given a query string and optional options (`country`, `count`), call Brave Suggest API and return the list of suggestion strings (or rich result shape if we want `rich=true` later).
- **API key**: Read once (e.g. in constructor or at call time) via `getEnvVar("BRAVE_API_KEY")`. If empty, `suggest(query)` returns `[]` without making a request.
- **HTTP**: Use `fetch` (Node 18+ / Electron) to `GET .../suggest/search?q=...&country=US&count=5`, with header `X-Subscription-Token`.
- **Errors**: On network or API error, log and return `[]` (or surface a structured error if we want UI to show “suggestions unavailable”).

### 3. IPC and preload

- **New handler**: `search:suggest` — invoke with `(query: string, options?: { country?: string; count?: number })`, returns `string[]` (or `{ query: string }[]` if we keep Brave’s shape).
- **Preload**: Expose `search.suggest(query, options?)` on `window.electronAPI.search`.
- **Types**: Update `src/types/electron.d.ts` so `search.suggest` is typed.

### 4. Dependency injection

**Decision: Option A.**

- Register a `braveSuggestService` in ServiceRegistry (no deps, or only env). Search handlers depend on it and call it for `search:suggest`. Dedicated service is testable and swappable.
- (Option B — suggest client inside search handlers + `getEnvVar` only — rejected: less testable.)

### 5. Combining results into a single ranked list

Workspace UI today shows **slash commands** and **in-doc search results** in one list; indices are split by source (slash vs search). Adding Brave Suggest as a third source requires a single ordered list so keyboard nav and selection stay consistent. We **do** use a combiner/ranker: each source conforms to a shared interface that includes a **normalized score**, and the combiner produces one sorted list.

**Shared interface: ranked result**

Each source adapts its raw results into a common shape so the ranker can sort across sources. Every item has a **normalized score** in a consistent range (e.g. 0–1):

```typescript
interface RankedWorkspaceItem {
  /** Discriminator for rendering and selection */
  kind: "slash" | "note" | "suggest";
  /** Normalized relevance score in [0, 1] for ranking across sources */
  score: number;
  /** Original payload for this source */
  payload: SlashCommandOption | SearchResult | { query: string };  // suggest: query string (or full Brave result if rich)
}
```

- **Slash**: Map filter/match strength (or ordinal position) → normalized score (e.g. exact match = 1, prefix match = 0.8, etc.).
- **Notes**: FTS/search already returns a `score`; normalize it into [0, 1] (e.g. min–max over the batch or cap/scale).
- **Brave Suggest**: The Brave Suggest API **does not return a confidence or score** per result. The response only has `query`, and optionally `is_entity`, `title`, `description`, `img`. We assign a **synthetic normalized score** from position: e.g. first result = 1.0, second = 0.9, third = 0.8, … (or linear decay). That keeps Brave results rankable relative to each other and to other sources.

**Combiner / ranker**

- Each source exposes results as `RankedWorkspaceItem[]` (or we have small adapters: `slashToRanked`, `notesToRanked`, `suggestToRanked`).
- Combiner merges the three arrays and **sorts by `score` descending** (optionally then by source order as tiebreaker). Cap total or per-source (e.g. max 5 per source, or max 20 total) so the list stays manageable.
- Output: single `RankedWorkspaceItem[]` for the UI; render and `handleSelect` branch on `item.kind` and use `item.payload`.

**Location**: Workspace domain, e.g. `src/domains/workspace/combineSuggestions.ts`: interface, adapters per source, and `combineAndRank(slash, notes, suggest): RankedWorkspaceItem[]`.

### 6. Workspace UI integration

- **Fetch Brave suggest**: In WorkspaceBlock, alongside the existing debounced `search.execute`, call `search.suggest(trimmedQuery, { count: 5 })` with the same (or similar) debounce (e.g. 300 ms). Store results in state, e.g. `suggestQueries: string[]`.
- **Combine**: Run the combiner on `filteredOptions`, `searchResults`, and `suggestQueries` to get a single `WorkspaceSuggestion[]`.
- **Render**: Iterate over the combined list; for each item render the appropriate row (slash option, note preview, or suggest query) and set `data-index={index}` so selection and scroll-into-view stay correct.
- **Handle select**: `handleSelect(index)` uses `combinedList[index]`: if `kind === "slash"` call existing `selectOption`, if `kind === "note"` call `selectSearchResult`, if `kind === "suggest"` perform the chosen action for a suggest (e.g. set query to the suggestion and re-run, or insert as search block / open in browser — define product behavior).
- **Empty suggest**: When `BRAVE_API_KEY` is missing, `search.suggest` returns `[]`; the combiner just gets fewer items and the UI shows no Brave section.

This makes the workspace the single place that consumes slash + notes + Brave suggest and presents one ranked list.

### 7. Display: megadropdown menu

The current workspace dropdown is a **single narrow column** (maxHeight 300px, one item per row). With three sources (slash, notes, suggest), that wastes horizontal space and limits how much we can show. A **megadropdown** layout uses more of the screen so we can fit more content and make better use of width.

**Goals**

- Use more horizontal space so the panel feels like a **command / search hub**, not a thin list.
- Show more items at once (e.g. more slash options, more notes, more suggestions) without endless vertical scrolling.
- Keep a single **selection model** and keyboard nav (↑↓ Enter Esc) so behavior stays predictable.

**Layout options**

1. **Multi-column by source**  
   One column per source: e.g. “Blocks” | “Notes” | “Suggest”. Each column is a short list (e.g. 5–8 rows). User moves with ↑↓ within a column; Tab / ←→ could move between columns, or we keep a single **flat index** (row-major: first column top-to-bottom, then second, then third) so ↑↓ only. Pros: clear grouping, lots visible. Cons: columns can be uneven; need a rule for “which column gets focus first.”

2. **Grid of cards**  
   Items as cards in a 2D grid (e.g. 3–4 columns). Selection is row-major index; ↑↓ move rows, ←→ move columns (or wrap). Works well for slash commands (icon + label). Notes and suggest rows can be wider (span columns) or same card size. Pros: dense, modern. Cons: keyboard rules a bit more complex; need consistent card size or mixed layout.

3. **Wide single area with sections**  
   Same logical order as the combined list (slash → notes → suggest) but **visually** in a wider panel: sections side-by-side or in a 2–3 column flow. Each section has a header and a short list. Single flat index for selection; layout is just CSS (e.g. `display: grid` or flex with wrapping). Pros: minimal change to “one list” model; we only change how that list is laid out. Cons: need to ensure focus order matches visual order.

**Decision: wide panel with sections (option 3).**

We keep one `RankedWorkspaceItem[]` and one `selectedIndex`. Layout: one container with a **CSS Grid or multi-column flex** that renders sections (Blocks, Notes, Suggest) in columns or a horizontal flow. Each section shows its slice of the combined list (or we still iterate the combined list and lay out by `kind`). Selection and `data-index` stay as today; we only change the container from a single column to a wider, multi-column/multi-section layout. If we later want true “megadropdown” columns (option 1), we can introduce column-aware keyboard nav.

**Concrete**

- Replace the single scrollable column with a **wider dropdown**: min-width 480px–560px, max-width 90vw, **max-height 800px**.
- Use a **wide panel with sections** layout: grid or flex with sections (Blocks | Notes | Suggest) in columns or horizontal flow. Sections with headers; each section scrolls independently if needed, or one scroll for the whole panel.
- Keep **one flat `combinedList`** and **one `selectedIndex`**; arrow keys advance by index; highlight the item at `selectedIndex` regardless of which column it’s in.
- Optional: “empty” sections (e.g. no suggest when key missing) still take a narrow column or collapse so the layout doesn’t jump.

This gives a megadropdown feel (more content on screen, less constricting) without changing the underlying data or selection model in step 6.

---

## Implementation Order

1. **Env and docs**
   - Add `BRAVE_API_KEY` to `.env.example` (no value).
   - In CLAUDE.md (or env docs), note that `BRAVE_API_KEY` in `.env.local` enables Brave Suggest; no default.

2. **BraveSuggestService**
   - New file: `BraveSuggestService` that:
     - Uses `getEnvVar("BRAVE_API_KEY")` with no default.
     - Exposes `suggest(query: string, options?: { country?: string; count?: number }): Promise<string[]>`.
     - If key is empty, return `[]` without calling Brave.
     - Otherwise `GET https://api.search.brave.com/res/v1/suggest/search?q=...&country=US&count=5`, header `X-Subscription-Token`, parse JSON and return `results.map(r => r.query)`.
     - On throw or non-OK response, log and return `[]`.

3. **ServiceRegistry**
   - Register `braveSuggestService` (factory creates `BraveSuggestService` instance, no container deps).

4. **IPC**
   - In `searchHandlers.ts`, add `"search:suggest"` handler that resolves `braveSuggestService` and calls `suggest(query, options)`.
   - Wire handler in the IPC router so it receives the service (same pattern as `search:execute` with `searchIndexManager`).

5. **Preload and types**
   - Preload: `search.suggest(query, options?)` → `ipcRenderer.invoke("search:suggest", query, options)`.
   - `electron.d.ts`: Add `search.suggest(...)` returning `Promise<string[]>`.

6. **Combiner and ranked interface**
   - Add `RankedWorkspaceItem` (kind, score, payload) and per-source adapters that produce a **normalized score** in [0, 1]: slash from match strength, notes from FTS score, Brave from **synthetic position-based score** (Brave API has no confidence field). Implement `combineAndRank(slash, notes, suggest): RankedWorkspaceItem[]` in workspace domain (e.g. `combineSuggestions.ts`); sort by score descending, optional per-source or total caps.

7. **Workspace UI**
   - In WorkspaceBlock: add state for `suggestQueries`; debounced fetch of `search.suggest(trimmedQuery)` (same or similar debounce as search).
   - Build combined list with the ranker; render a single list over `RankedWorkspaceItem[]` (one row per item, correct `data-index`).
   - Update `handleSelect(index)` to branch on `combinedList[index].kind` (slash → selectOption, note → selectSearchResult, suggest → TBD: e.g. set query, or insert as search block / open in browser).
   - Define and implement the “select suggest” action (product decision).

8. **Megadropdown display**
   - Replace single-column results area with a **wide panel with sections** megadropdown: min-width 480px–560px, max-width 90vw, **max-height 800px**.
   - Layout: CSS Grid or flex with sections (Blocks | Notes | Suggest) in columns or horizontal flow; same combined list and flat `selectedIndex`, arrow keys unchanged.
   - Section headers; empty sections collapse or reserve minimal space. Optional: per-section scroll or one scroll for the whole panel.

---

## Summary

| Item                  | Choice                                                                                                                                                                                                                 |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **API key**           | `getEnvVar("BRAVE_API_KEY")`, no default                                                                                                                                                                               |
| **When key empty**    | No request; suggest returns `[]`                                                                                                                                                                                       |
| **Service**           | `BraveSuggestService` in main process, registered in ServiceRegistry                                                                                                                                                   |
| **IPC**               | `search:suggest` → returns `string[]`                                                                                                                                                                                  |
| **Preload/types**     | `search.suggest(query, options?)` on `electronAPI.search`                                                                                                                                                              |
| **Combiner / ranker** | Shared `RankedWorkspaceItem` (kind, score, payload); each source has adapter with **normalized score** [0,1]; Brave uses **synthetic score** (API has no confidence); `combineAndRank()` sorts by score, optional caps |
| **Workspace UI**      | Single list from combiner; fetch suggest debounced; handleSelect by `kind`; define “select suggest” action                                                                                                             |
| **Display**           | Megadropdown: **wide panel with sections**; min-width 480–560px, max-width 90vw, **max-height 800px**; sections (Blocks \| Notes \| Suggest); same flat list + selectedIndex, ↑↓ unchanged                             |
| **Docs**              | `.env.example` + CLAUDE.md note for `BRAVE_API_KEY`                                                                                                                                                                    |
