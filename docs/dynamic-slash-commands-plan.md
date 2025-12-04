# Dynamic Slash Commands - Phase 1 Plan

Goal: externalize slash command configuration, allow runtime updates, and keep the palette powered by a dynamic store that works with today’s Electron renderer/main split and local SQLite persistence.

## Current Constraints
- Renderer UI + main process with local SQLite; no cross-instance sync yet.
- Command palette consumes a baked-in registry in renderer code (`src/data/slashCommandOptions.ts`).
- Communication between renderer and main uses Electron IPC via centralized `IPCRouter` (PR #12 architecture).
- Local DB is single-writer (main), so renderer must go through IPC for mutations.
- Existing app services are wired through the DI container with version metadata; new slash-command services should follow the same pattern so the palette/store code can request them without ad-hoc imports.
- IPC handlers are organized into handler groups (e.g., `createBrowserHandlers`, `createDocumentHandlers`) registered via `IPCRouter`.

## Outcomes for Phase 1
- Commands are loaded from SQLite (or a cached JSON seed) instead of static imports.
- Renderer can create/update/delete commands at runtime via IPC without app restart.
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
- Implement the slash-command store as a main-process service registered in the existing DI container (with version metadata, following PR #12's versioned services pattern) so migrations, IPC handlers, and future sync hooks reuse shared DB/logging dependencies rather than introducing a separate wiring path.

## IPC Surface (Main ↔ Renderer)
Expose a focused IPC contract from main to renderer using the centralized `IPCRouter` pattern (aligned with PR #12's architecture):

**Handler Group Pattern:**
Create `src/ipc/handlers/slashCommandRegistryHandlers.ts` following the established pattern:
- Function signature: `createSlashCommandRegistryHandlers(slashCommandStore: SlashCommandStore): IPCHandlerMap`
- Returns a map of channel names to handler definitions
- Handlers are registered via `router.registerNamespace('slash-commands', handlers)` in `main.ts`

**IPC Channels (Handlers):**
- `slash-commands:list` (invoke) → returns full list with timestamps and source.
- `slash-commands:create` (invoke) → payload `{ alias, label, target, source? }`.
- `slash-commands:update` (invoke) → payload `{ id, alias?, label?, target?, source? }` with unique-alias enforcement.
- `slash-commands:delete` (invoke) → payload `{ id }`.

**IPC Events (Main → Renderer):**
- `slash-commands:changed` → event emitted by main process after any mutation (create/update/delete) so the renderer store stays in sync. Payload includes the affected command(s) and operation type.

**Implementation Notes:**
- All handlers run in main, validate alias/URL, and write to SQLite
- Errors are propagated with structured codes (e.g., `alias_conflict`)
- Follow the same pattern as `createBrowserHandlers`, `createDocumentHandlers`, etc.
- The `SlashCommandStore` service should be registered in the DI container with version metadata

**Example Handler Group Structure:**
```typescript
// src/ipc/handlers/slashCommandRegistryHandlers.ts
import { IPCHandlerMap } from "../IPCRouter";
import { SlashCommandStore } from "../../services/SlashCommandStore";

export function createSlashCommandRegistryHandlers(
  store: SlashCommandStore
): IPCHandlerMap {
  return {
    "list": {
      type: "invoke",
      fn: async () => store.listCommands(),
    },
    "create": {
      type: "invoke",
      fn: async (_event, payload: { alias: string; label: string; target: string; source?: string }) => {
        return store.createCommand(payload);
      },
    },
    "update": {
      type: "invoke",
      fn: async (_event, payload: { id: string; alias?: string; label?: string; target?: string; source?: string }) => {
        return store.updateCommand(payload);
      },
    },
    "delete": {
      type: "invoke",
      fn: async (_event, id: string) => {
        return store.deleteCommand(id);
      },
    },
    // Note: "changed" events are emitted by the store/service after mutations
    // using sendToRenderer("slash-commands:changed", payload) pattern
    // This is not a handler but rather an event broadcast mechanism
  };
}
```

**Registration in main.ts:**
```typescript
// In setupIpcHandlers function, after getting services:
const slashCommandStore = serviceContainer.get<SlashCommandStore>("slashCommandStore");
// Pass sendToRenderer callback to store so it can emit change events
slashCommandStore.setOnChangeCallback((payload) => {
  sendToRenderer("slash-commands:changed", payload);
});
registerMap(createSlashCommandRegistryHandlers(slashCommandStore));
```

**Event Emission:**
The `slash-commands:changed` event is emitted by the `SlashCommandStore` service after any mutation (create/update/delete), using the `sendToRenderer` pattern established in `setupIpcHandlers`. This follows the same pattern as `broadcastDocumentTree` and `broadcastProfiles`.

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
1. **Service & Data Layer:**
   - Create `SlashCommandStore` service class with version `1.0.0` in DI container
   - Add migration + seed logic in main
   - Register service in `ServiceRegistry.ts` with database dependency

2. **IPC Integration:**
   - Create `src/ipc/handlers/slashCommandRegistryHandlers.ts` following PR #12's handler group pattern
   - Implement `slash-commands:list` handler (invoke type)
   - Register handlers via `router.registerNamespace('slash-commands', createSlashCommandRegistryHandlers(store))` in `main.ts`
   - Replace palette read path to use IPC (read-only)

3. **Mutation Handlers:**
   - Add `slash-commands:create`, `slash-commands:update`, `slash-commands:delete` handlers (all invoke type)
   - Wire renderer mutations to use them
   - Add alias validation and error handling

4. **Event Subscription:**
   - Implement `slash-commands:changed` event emission in store after mutations
   - Wire store to use `sendToRenderer` callback to broadcast changes
   - Add cache invalidation in renderer on event receipt
   - Add logging for failures and conflicts

5. **Resilience:**
   - Add fallback/readonly mode for DB failure
   - Add minimal UI messaging when edits are blocked

## Future Hooks (Not in Phase 1 but unblocked)
- History-based suggestions can be added as `source='history'` rows populated by a scoring job in main.
- Profile-aware storage can piggyback on this table later by adding `profile_id` column and partitioned queries.
- Sync between browser instances can observe the same IPC contract once a sync transport exists.
