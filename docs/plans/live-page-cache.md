# Live Page Cache

## Summary

Digest should treat recently added site blocks like lightweight browser tabs. The last ten recently used pages remain alive as detached Electron `WebContentsView` instances. Reopening one of those blocks reattaches the existing view instead of loading the URL again, preserving the page's real runtime state: scroll position, navigation history, form values, SPA state, and other in-page context.

A small green dot beside a site link in the BlockNote editor indicates that its page is currently live in memory.

The cache is ephemeral. Notebook content remains the durable source of truth, while the dot reports current process state and must not be persisted as a block property.

## Motivation

The current implementation saves `scrollPercent` on every site block and injects JavaScript to capture and restore it. This is unusually narrow: scroll is only one part of the state users expect a browser tab to retain, and a percentage is an imperfect restoration coordinate when a document changes size or loads incrementally.

Chromium already owns a more complete model:

- A live `WebContents` contains the current document and JavaScript runtime.
- Its `NavigationController` owns the back/forward stack.
- Each navigation entry has serialized `PageState`, including scroll and form state.
- Electron exposes that data through `webContents.navigationHistory`.

The immediate reason Digest loses this state is lifecycle rather than a Chromium limitation. `Page` requests removal when its React component unmounts, and the main process responds by calling `webContents.close()`. Keeping a bounded number of views alive gives Digest normal tab-like behavior without keeping every page indefinitely.

## Goals

- Keep up to ten recently used notebook pages live in memory.
- Reopen a cached page without reloading it.
- Preserve scroll, browser navigation, form values, and active page runtime state where possible.
- Clearly but subtly show which site blocks have a live page.
- Bound memory and process usage with deterministic eviction.
- Keep cache state separate from the persisted notebook document.
- Preserve Chromium navigation state before eviction so a later cold restore can be better than a plain `loadURL()`.

## Non-goals

- Persisting live renderer processes across application restarts.
- Keeping every site block alive.
- Guaranteeing that all third-party pages resume perfectly after eviction or restart.
- Treating the persistent Electron `Session` as tab storage. A session is a profile containing cookies, cache, local storage, IndexedDB, service workers, and similar origin data; it does not retain a tab's live document.
- Displaying the green dot for a page that can merely be reloaded from disk or network.

## User experience

### Adding a page

1. A URL is added to the notebook as a site block.
2. Digest explicitly warms a browser view for the page if newly inserted pages should become live before first open.
3. Once the page is ready, the view is associated with the site block.
4. When no longer visible, the view is detached from the window but remains alive in the cache.
5. A green dot appears beside the link in the editor.

### Reopening a live page

1. The user clicks a dotted site block.
2. Digest looks up the block ID in the cache.
3. The existing view is attached at the full-page browser bounds.
4. The user sees the exact retained page state without a new navigation.

### Leaving a page

When the user returns to the notebook, the view is detached and returned to the cache. It is not closed. Its recency is updated so a page the user just visited is less likely to be evicted.

### Eviction

When adding or activating a page would exceed the limit:

1. Select the least recently used detached entry.
2. Capture its Electron navigation history and active index.
3. Close its `WebContents` and remove its live handle.
4. Notify the renderer that the block is no longer live.
5. Remove the green dot.

A currently visible page must not be evicted. If no detached entry is available, eviction waits until a view is detached.

Although the feature can be described as the “last ten pages added,” least-recently-used behavior is more useful in practice: reopening an older page makes it recent again. The initial insertion of a page counts as use.

## State model

The main process should own the authoritative cache because it owns every `WebContentsView`.

```ts
type LivePageState = "visible" | "cached";

type LivePageEntry = {
  blockId: string;
  view: WebContentsView;
  profileId: string;
  url: string;
  state: LivePageState;
  lastUsedAt: number;
};
```

The cache is keyed by stable notebook block ID, not URL. The same URL may appear more than once in a notebook and each occurrence can have independent navigation and page state.

The live entry should not be serialized into BlockNote, Y.js, or SQLite. Optional cold-restoration data is separate:

```ts
type SavedNavigationState = {
  blockId: string;
  entries: Electron.NavigationEntry[];
  activeIndex: number;
  savedAt: number;
};
```

`NavigationEntry.pageState` is Chromium-owned base64 data. Digest should treat it as opaque and version-sensitive.

## Lifecycle operations

The current remove operation combines two different meanings and needs to be split.

### Detach

- Remove the view from `BaseWindow.contentView` or `ViewLayerManager`.
- Retain its `WebContents`, event listeners, handle, and cache entry.
- Mark the entry `cached`.
- Update its recency.

### Attach

- Find the cached entry by block ID.
- Add its existing view to the appropriate view layer.
- Set the new bounds.
- Mark it `visible`.
- Update its recency.
- Do not call `loadURL()` on a cache hit.

### Destroy

- Detach the view if necessary.
- Optionally capture `navigationHistory`.
- Close `webContents`.
- Remove listeners, handles, world state, and cache metadata.
- Emit the cache-state change.

Explicit deletion of a site block should destroy its cached view immediately rather than merely detach it.

## View identity

Digest currently uses layout-qualified IDs: an inline view uses `blockId`, while a full view uses `blockId:full`. The notification preview uses another synthetic ID ending in `-preview`. This creates multiple browser identities for what the user perceives as one page.

For live pages, identity and placement should be separate:

```text
block ID -> one WebContentsView -> zero or one current placement
```

`inline`, `preview`, and `full` describe bounds and presentation, not distinct tabs. Moving to this model is the largest architectural part of the feature because hooks and IPC currently assume the layout-qualified view ID is also the browser identity.

The preferred end state is:

- Use `blockId` as the stable browser/cache key.
- Pass layout separately in view updates.
- Reattach and resize the same view when presentation changes.
- Keep synthetic IDs only for genuinely ephemeral pages that do not yet have a notebook block.

## Retiring creation previews

The existing site-block notification loads a separate `${blockId}-preview` view and destroys it when the animation ends. It was intended to provide feedback when a page block was created in the background, but command-click no longer follows that path: it inserts an inline link and emits a separate link-capture event.

The preview system should not be adopted into the live-page cache. It creates an extra browser identity and page load for a transient visual. The cache should instead receive an explicit create or warm operation for the final site block when immediate caching of newly added pages is implemented.

Removing the preview system also simplifies the identity consolidation work: there is no `${blockId}-preview` identity to migrate or transfer.

## IPC and renderer state

The renderer needs a read-only projection of cache membership. It should not infer liveness from mounted React components.

Proposed messages:

```ts
// Renderer -> main
browser:attach-live-page { blockId, bounds, layout, url, profileId }
browser:detach-live-page { blockId }
browser:destroy-live-page { blockId }
browser:get-live-pages

// Main -> renderer
browser:live-pages-changed { blockIds: string[] }
```

Sending the complete set is preferable while the cache is limited to ten entries. It makes initial synchronization, missed-event recovery, and renderer reloads straightforward.

A renderer context or external store can expose:

```ts
const liveBlockIds = useLivePageCache();
const isLive = liveBlockIds.has(block.id);
```

The main process should send an initial snapshot after the renderer subscribes. It should also emit after cache insertion, eviction, explicit destruction, and renderer/view recovery.

## Green-dot indicator

The dot communicates one precise fact: clicking this link can resume a live in-memory page.

Recommended presentation:

- A 6–8 px green circle before the URL.
- Vertically aligned with the link text.
- Tooltip or accessible label: “Page is kept live.”
- A restrained color and no pulsing animation.
- A brief fade on appearance or eviction is acceptable but not required.

The indicator should not mean “online,” “loaded before,” “saved,” or “available offline.” It must disappear as soon as the live `WebContents` is destroyed.

Because the dot represents runtime state, it must be rendered from the live-page store rather than added to the site block prop schema.

## Navigation state and cold restoration

Before eviction, Digest can capture:

```ts
const entries = view.webContents.navigationHistory.getAllEntries();
const activeIndex = view.webContents.navigationHistory.getActiveIndex();
```

A new view can later restore that state before any `loadURL()` call:

```ts
await view.webContents.navigationHistory.restore({
  entries,
  index: activeIndex,
});
```

This is a best-effort cold restore. It may recover scroll, form values, and back/forward history, but it is not equivalent to retaining the live DOM and JavaScript heap. It therefore does not earn a green dot.

Cold state can initially remain in memory after eviction. Persisting it across application restarts should be a separate decision because Chromium page-state compatibility, storage size, privacy, and retention policy need explicit treatment.

## Retiring `scrollPercent`

The custom scroll mechanism currently:

- injects a `scrollend` listener into each page;
- sends the scroll percentage through console messages and IPC;
- persists it in the site's BlockNote props;
- injects a later `window.scrollTo()` restoration script.

This can be removed after live reuse and navigation-history restoration are proven reliable.

A safe migration sequence is:

1. Add the live cache while leaving `scrollPercent` as a fallback.
2. Use live views on cache hits and skip manual scroll restoration for them.
3. Use Electron navigation-history restoration on cold hits.
4. Measure restoration failures and site-specific issues.
5. Stop writing new `scrollPercent` values.
6. Remove the prop and injected tracking in a later document/schema migration.

Existing blocks containing the prop can tolerate it as ignored legacy data during the transition.

## Memory and process considerations

Ten live pages may still be expensive. Chromium renderer processes can consume significant memory, and multiple views can share or split processes depending on site isolation.

The initial policy is a fixed limit of ten because it is predictable and easy to explain. Follow-up safeguards may include:

- Evicting crashed or unresponsive views first.
- Evicting entries under critical memory pressure.
- Suspending media when a view is detached.
- Respecting Page Visibility and Electron background throttling.
- Exposing the limit as an advanced preference only if actual usage shows a need.

The cache should never keep preview-only views that failed to become valid notebook blocks.

## Failure handling

- **Cached renderer crashed:** destroy the entry, clear the dot, and fall back to cold restoration or `loadURL()`.
- **URL or profile changed:** destroy the incompatible cached view and create a new one. A `WebContents` cannot switch Electron session partitions after creation.
- **Block deleted:** immediately destroy its live and saved state.
- **Document changed externally:** remove cache entries for block IDs that no longer exist when reconciliation runs.
- **Attach failure:** clear the stale entry and retry with a newly created view.
- **Application shutdown:** close all views normally; dots disappear naturally on the next process start.
- **Renderer reload:** main remains authoritative and returns a fresh snapshot of live block IDs.

## Proposed implementation stages

### Stage 1: Separate detach from destroy

- Add explicit lifecycle commands and interpreter operations.
- Keep detached views in the handle registry.
- Ensure a detached view can be reattached with new bounds.
- Preserve the current behavior for explicit block deletion.

### Stage 2: Add bounded LRU ownership

- Introduce a `LivePageCache` owned by `ViewStore` or a focused service beside it.
- Enforce a ten-entry limit.
- Never evict visible entries.
- Add deterministic tests for recency and eviction.

### Stage 3: Consolidate identity

- Make block ID the stable browser identity.
- Treat layout as placement state.
- Remove the need for separate inline and `:full` live views.
- Reconcile notification preview identity.

### Stage 4: Surface liveness in BlockNote

- Add cache snapshot/change IPC.
- Add a renderer cache context or store.
- Render the accessible green dot in `SiteBlock`.
- Verify that notebook persistence never includes the live flag.

### Stage 5: Remove legacy preview notifications

Status: preview cleanup completed July 20, 2026; cache warming and command-click feedback remain separate follow-up work.

- [x] Remove the site-block preview component and its browser view lifecycle.
- [x] Remove the old block-notification provider, container, hook, layout reservation, and route row.
- [x] Remove the unreachable `browser:new-block` / `browser:create-block` producer chain and its editor, preload, main-process, and renderer API wiring.
- [ ] Improve command-click feedback through the existing link-capture path without creating a browser view.
- [ ] Add an explicit cache warm/create operation for newly added site blocks if they should become live before first open.

### Stage 6: Add cold restoration

- Capture navigation entries on eviction.
- Restore them before `loadURL()` on a cold reopen.
- Bound saved state and clear it when the block is deleted or materially changed.

### Stage 7: Remove manual scroll persistence

- Stop writing `scrollPercent` after validation.
- Remove injected scroll tracking and restoration.
- Remove associated IPC and renderer hooks.
- Retain compatibility with existing documents during migration.

## Testing strategy

### Unit tests

- Inserting eleven detached entries evicts the least recently used one.
- Activating an older entry updates its recency.
- Visible entries are never selected for eviction.
- Deleting a block destroys its entry immediately.
- Cache snapshots contain exactly the live block IDs.
- Profile or URL incompatibility invalidates an entry.

### Integration tests

- Open a page, scroll and interact, leave it, and reopen it without another navigation.
- Navigate within a page, leave, reopen, and verify back/forward history remains intact.
- Add eleven pages and verify the first unused block loses its dot.
- Reopen a cached older page before adding the eleventh and verify a different page is evicted.
- Reload the Electron renderer and verify dots resynchronize from main-process state.
- Delete a dotted block and verify its `WebContents` is destroyed.
- Verify pages in different profile partitions never reuse the wrong view.

### Visual/accessibility checks

- The dot aligns correctly with long and wrapped URLs.
- The link remains keyboard accessible.
- The live state has a text alternative or tooltip and does not rely solely on color for assistive technology.
- Dot transitions do not shift the surrounding editor layout noticeably.

## Open questions

1. Should the fixed limit count a currently visible page, or mean ten detached pages plus the visible one? The simplest rule is ten total live notebook pages.
2. Should recency update when a page is added, attached, detached, or interacted with? The proposal updates on insertion and attach/detach; actual page interaction is unnecessary complexity initially.
3. Should cold navigation state be persisted across application restarts? This proposal defers it.
4. Should users be able to pin a live page against eviction? This is outside the initial scope but compatible with the cache model.
5. Should the visual indicator distinguish “live and visible” from “live and cached”? A single green dot is simpler; the active route already communicates visibility.
6. When should a newly added site block be warmed: immediately after insertion or only after first open? This should be explicit cache behavior rather than a side effect of rendering a preview notification.

## Recommended initial decisions

- Ten total live notebook pages.
- LRU eviction rather than strict insertion order.
- Stable identity by block ID.
- One green dot for both visible and detached live pages.
- Runtime-only liveness state owned by the main process.
- No cross-restart persistence of Chromium `pageState` initially.
- Keep `scrollPercent` temporarily as a fallback, then remove it after validation.
- Remove notification previews rather than adopting their temporary views into the cache.

## Cleanup inventory

The live-page work exposes two overlapping notification systems and several pieces of legacy browser-block plumbing. Cleanup should be handled deliberately so the command-click feedback regression is fixed rather than merely deleting its former UI.

### Legacy site-block preview system

Completed July 20, 2026. The old background site-block preview path was removed:

- `src/Browser/components/SiteBlockNotification.tsx`
- `src/Browser/components/SiteBlockNotification.css`
- `src/components/renderer/BlockNotificationContainer.tsx`
- `src/components/renderer/BlockRouteNotificationsRow.tsx`
- `src/context/BlockNotificationContext.tsx`
- `src/hooks/useBlockNotification.ts`
- `BlockNotificationProvider` and `BlockNotificationContext` wiring in `RendererApp.tsx`
- `BlockNotificationContainer` rendering in `EditorPane.tsx`
- Notification-driven grid rows and margins in `RendererLayout.tsx` and `BlockRouteViewContent.tsx`
- The preview-specific `removeBrowser()` call and `${blockId}-preview` view convention

The old producer chain was confirmed unreachable by repository search and removed:

- `browser:new-block` constants and preload subscription
- `onNewBrowserBlock` in the renderer API
- `createNewBrowserBlock()` and the module-level `onBlockCreatedCallback` in `useRendererEditor.ts`
- `browser:create-block` IPC and `electronAPI.browser.createBlock()`
- `createBrowserBlock` and the preview-path `setLinkClickCallback()` wiring in `main.ts`, `ViewStore`, and `EventTranslator`

`EventTranslator` continues to navigate foreground/new-window dispositions in the current page, while command-clicks continue through the inline-link and `browser:link-captured` path. The unrelated notebook-context `LinkInterceptionService.setLinkClickCallback()` remains in place because it routes intercepted links to URL routes rather than creating preview blocks.

Validation for the cleanup included a repository-wide reference search, targeted ESLint with no errors, and `git diff --check`. A full TypeScript check remains blocked by pre-existing errors outside this cleanup. An application smoke test is still recommended alongside the remaining Stage 5 work.

### Command-click feedback that must replace it

Command-click currently takes this path:

```text
background-tab disposition
  -> fetch target page title (up to five seconds)
  -> insert inline link
  -> emit browser:link-captured
  -> register LinkCaptureNotification in PageToolSlot
```

The user currently sees no reliable notification. The replacement should:

- acknowledge the command-click immediately, before title fetching;
- show a compact “Adding link…” state with the target URL;
- update to “Link added” after the editor insertion succeeds;
- show a failure state if insertion fails;
- render in a notification surface that cannot be silently replaced by another `PageToolSlot` registrant;
- avoid creating a `WebContentsView` solely for visual feedback.

The current link-capture implementation should be audited as part of that fix:

- `src/domains/link-capture/ui/useLinkCaptureNotification.ts`
- `src/domains/link-capture/ui/LinkCaptureNotification.tsx`
- `src/domains/link-capture/ui/LinkCaptureItem.tsx`
- `src/domains/link-capture/ui/LinkCaptureContext.tsx`
- `browser:link-captured` event wiring in `main.ts`, `preload.ts`, and `electron.d.ts`
- `PageToolSlotContext` registration and replacement semantics

### Manual scroll restoration

After live reuse and cold navigation restoration are validated, remove:

- the `scrollPercent` site-block prop;
- `browser:set-scroll-percent` and `browser:save-scroll-percent` IPC;
- `setScrollPercent()` preload and renderer API declarations;
- injected scroll tracking and restoration in `Interpreter`;
- the scroll update effect in `useRendererEditor`;
- the pending-scroll map and related `ViewStore` methods.

This cleanup remains staged because `scrollPercent` is the current fallback for cold page recreation.
