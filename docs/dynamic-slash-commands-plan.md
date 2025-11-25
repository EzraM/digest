# Dynamic Slash Commands - Phase 1 Plan

Goal: externalize slash command configuration, allow runtime updates, and keep the palette powered by a dynamic store that works with today’s Electron renderer/main split and local SQLite persistence.

## Current Constraints
- Renderer UI + main process with local SQLite; no cross-instance sync yet.
- Command palette consumes a baked-in registry in renderer code.
- Communication between renderer and main uses Electron RPC; there is no HTTP API surface.
- Local DB is single-writer (main), so renderer must go through IPC for mutations.

## Outcomes for Phase 1
- Commands are loaded from SQLite (or a cached JSON seed) instead of static imports.
- Renderer can create/update/delete commands at runtime via IPC without app restart.
- A minimal fallback set is available if DB load fails.
- Logging and state refresh hooks exist to enable later sync/telemetry work.

## Data Model & Persistence (Main Process)
- New SQLite table `slash_commands` managed by main process migration:
  - `id TEXT PRIMARY KEY`
  - `alias TEXT UNIQUE NOT NULL` (e.g., `/gh` → `gh` stored without slash)
  - `label TEXT NOT NULL` (human-friendly name shown in palette)
  - `target TEXT NOT NULL` (URL or action string; keep simple URL for Phase 1)
  - `source TEXT NOT NULL DEFAULT 'user'` (`default` | `user` | `history`) to allow future history-based suggestions
  - `created_at INTEGER NOT NULL`, `updated_at INTEGER NOT NULL`
- Seed defaults once on first migration run (GitHub, Google, Jira, 1Password, etc.).
- Add lightweight versioning (`schema_version` row in a `kv_store` table or similar) to avoid reseeding on every launch.
- Keep all writes centralized in main; renderer never writes SQLite directly.

## IPC Surface (Main ↔ Renderer)
Expose a focused IPC contract from main to renderer (typed where possible):
- `slash-commands:list` → returns full list with timestamps and source.
- `slash-commands:create` → payload `{ alias, label, target, source? }`.
- `slash-commands:update` → payload `{ id, alias?, label?, target?, source? }` with unique-alias enforcement.
- `slash-commands:delete` → payload `{ id }`.
- `slash-commands:subscribe` / `slash-commands:changed` event → pushes deltas after any mutation so the renderer store stays in sync.
- All handlers run in main, validate alias/URL, and write to SQLite; errors are propagated with structured codes (e.g., `alias_conflict`).

## Renderer Integration
- Replace static registry usage in the palette provider with a store hydrated from `slash-commands:list` on boot.
- Keep an in-memory cache keyed by `alias` with a `lastUpdated` marker; refresh on `slash-commands:changed` events.
- Ensure palette gracefully falls back to baked-in defaults if IPC load fails (feature-flaggable fallback path).
- Update command filtering/search to rely on dynamic store; preserve existing keyboard shortcuts and UX affordances.

## Default & Fallback Behavior
- On first launch post-migration, main seeds defaults into SQLite and emits `slash-commands:changed`.
- If DB initialization fails, return a bundled in-memory default list and mark store as `readonly` to block edits until DB recovers.
- Protect reserved aliases (`help`, `settings`, etc.) in validation.

## Rollout Steps (Incremental Delivery)
1. Add migration + seed logic in main; expose IPC list endpoint and replace palette read path (read-only).
2. Add create/update/delete IPC handlers with alias validation; wire renderer mutations to use them.
3. Implement change subscription and cache invalidation; add logging for failures and conflicts.
4. Add fallback/readonly mode for DB failure; add minimal UI messaging when edits are blocked.

## Future Hooks (Not in Phase 1 but unblocked)
- History-based suggestions can be added as `source='history'` rows populated by a scoring job in main.
- Profile-aware storage can piggyback on this table later by adding `profile_id` column and partitioned queries.
- Sync between browser instances can observe the same IPC contract once a sync transport exists.
