# Live Page Cache

## Summary

Digest is a link-based browser. Notebook references are its durable short- and long-term memory; live browser state is temporary and should remain an implementation detail rather than becoming a user-visible tab system.

The cache should retain a bounded number of browsing journeys. A journey owns one Electron `WebContentsView`, its navigation history, and the live runtime state of its current document. URLs encountered within that journey are indexed by profile and normalized URL so a notebook link can resume a suitable recently live page when possible.

Opening a notebook link should feel immediate when Digest can reuse a journey. Logical Back boundaries were part of the original design, but are deferred as of July 21, 2026; the current implementation preserves the journey's Chromium history without adding a Digest-specific activation boundary.

Inline links, legacy site blocks, and ephemeral URL routes are all notebook or route references to URLs. None of them should directly own a `WebContentsView`. A small green dot may indicate that a reference currently resolves to a suitable live page in its profile.

The cache and its reference associations are ephemeral. Notebook content remains the durable source of truth, and live state must not be persisted as a block property.

## Design revision: July 21, 2026

The initial implementation keyed live views by layout-qualified block ID. Further design work established that this is the wrong long-term ownership boundary:

- A URL is a destination, not a unique browser-state identity.
- A notebook block or inline link is a durable reference, not the owner of a browser process.
- A `WebContentsView` is a browsing journey analogous to a browser tab, although Digest should avoid exposing tabs or contexts as a concept users must manage.
- One journey may visit many URLs, and several notebook references created from that journey may logically resume positions within it.
- The same profile and URL may eventually have more than one independent live instance, so `(profileId, normalizedUrl)` is a lookup index rather than a uniqueness constraint.
- Layout is placement. Moving a journey between detached, inline, and full presentation must not create a second browser identity.

The block-keyed `LivePageCache` prototype has now been replaced by `BrowsingJourneyStore`. The implementation still uses Electron handle IDs internally, while opaque journey identity, placement identity, URL associations, and reference associations are maintained separately in the journey core.

## Motivation

The current implementation saves `scrollPercent` on every site block and injects JavaScript to capture and restore it. This is unusually narrow: scroll is only one part of the state users expect a browser tab to retain, and a percentage is an imperfect restoration coordinate when a document changes size or loads incrementally.

Chromium already owns a more complete model:

- A live `WebContents` contains the current document and JavaScript runtime.
- Its `NavigationController` owns the back/forward stack.
- Each navigation entry has serialized `PageState`, including scroll and form state.
- Electron exposes that data through `webContents.navigationHistory`.

The immediate reason Digest loses this state is lifecycle rather than a Chromium limitation. `Page` requests removal when its React component unmounts, and the main process responds by calling `webContents.close()`. Keeping a bounded number of views alive gives Digest normal tab-like behavior without keeping every page indefinitely.

## Goals

- Keep a bounded number of recently used browsing journeys live in memory, scoped by profile.
- Reopen a suitable recently live page without reloading it when possible.
- Preserve scroll, browser navigation, form values, and active page runtime state where possible.
- Give each notebook-link activation fresh Back-button semantics through a logical history boundary.
- Allow inline links, legacy site blocks, and ephemeral URLs to use the same resolution mechanism.
- Clearly but subtly show which notebook references can resume a live page.
- Bound memory and process usage with deterministic eviction.
- Keep cache state separate from the persisted notebook document.

## Non-goals

- Persisting live renderer processes across application restarts.
- Restoring an evicted journey or its Chromium navigation state. An evicted page opens as a fresh journey and reloads its URL.
- Keeping every referenced or visited URL alive.
- Guaranteeing that all third-party pages resume perfectly after eviction or restart.
- Guaranteeing exact live state for a non-current navigation entry. Chromium may discard a document from its back/forward cache.
- Giving users a tab or browsing-context management interface.
- Treating a URL as a globally unique page-state identity.
- Treating the persistent Electron `Session` as tab storage. A session is a profile containing cookies, cache, local storage, IndexedDB, service workers, and similar origin data; it does not retain a tab's live document.
- Displaying the green dot for a page that can merely be reloaded from disk or network.

## User experience

### Adding a reference

1. The user adds the current page to the notebook as an inline link or another link-bearing block.
2. Digest records the durable URL and title in the notebook.
3. Digest may associate that reference with the current journey and navigation entry in ephemeral runtime state.
4. Returning to the notebook detaches the journey but keeps it alive subject to the cache limit.
5. A green dot appears if the new reference resolves to a suitable live association.

Adding a reference must not create a second `WebContentsView` or reload the page solely to warm the cache.

### Opening a notebook link

1. The user clicks an inline link, legacy site block, or another supported URL reference.
2. Digest resolves the reference's profile and normalized URL against the live-page index.
3. If a suitable association exists, Digest activates its journey and selects the associated live page.
4. If no suitable association exists, Digest creates a fresh journey with fresh Chromium history and loads the URL.

If the requested URL is already the current live document, the user receives its exact retained runtime state. If it is an older entry in the journey, activation is best-effort because Chromium may have discarded that document from its back/forward cache.

### Leaving a page

When the user returns to the notebook, the active journey is detached and returned to its profile's cache. It is not closed. Its recency is updated so the journey the user just visited is less likely to be evicted.

Following a link inside a page updates the journey's current URL and URL index. It does not mutate the notebook reference that originally opened the journey.

If the user adds a later page from the same journey to the notebook, both references may associate with different positions in that journey. Clicking either reference can therefore resume the shared browsing history without requiring the user to understand or manage contexts.

### Eviction

When adding or activating a page would exceed the limit:

1. Select the least recently used detached journey in the relevant profile cache.
2. Close its `WebContents` and remove its live handle.
3. Remove associations that depended on the live journey.
4. Notify the renderer so affected references lose their green dots.

A currently visible page must not be evicted. If no detached entry is available, eviction waits until a view is detached.

Least-recently-used behavior applies to journeys, because `WebContents` instances are the expensive resource. Reference count and URL count do not determine the live-cache size.

## State model

The main process should own the authoritative cache because it owns every `WebContentsView`.

```ts
type JourneyPlacement = "visible" | "detached";

type BrowsingJourney = {
  journeyId: string;
  view: WebContentsView;
  profileId: string;
  currentUrl: string;
  placement: JourneyPlacement;
  lastUsedAt: number;
};

type LivePageAssociation = {
  journeyId: string;
  normalizedUrl: string;
  navigationEntryKey?: string;
  navigationEntryIndex?: number;
  lastSeenAt: number;
};

type ReferenceAssociation = {
  referenceId: string;
  profileId: string;
  normalizedUrl: string;
  journeyId: string;
  navigationEntryKey?: string;
};

type JourneyActivation = {
  journeyId: string;
  backBoundaryIndex: number;
};
```

`journeyId` is independent of URL, block ID, and layout. `(profileId, normalizedUrl)` indexes zero or more associations ordered by suitability and recency. It must not enforce permanent uniqueness.

Reference associations are runtime hints. A first implementation may omit durable `referenceId` associations and resolve solely through the profile/URL index, provided it preserves the option to add reference-specific disambiguation later.

URL normalization must be conservative. It may normalize unambiguous syntax such as default ports and URL serialization, but it must not discard fragments, query parameters, or other components that applications may use as state.

The live entry should not be serialized into BlockNote, Y.js, or SQLite. Eviction destroys the journey state; no separate navigation snapshot is retained.

## Lifecycle operations

The current remove operation combines different meanings and needs to be split. These operations act on journeys; reference deletion is a separate reconciliation event.

### Detach

- Remove the view from `BaseWindow.contentView` or `ViewLayerManager`.
- Retain its `WebContents`, event listeners, handle, journey, and URL associations.
- Mark the journey `detached`.
- Update its recency.

### Attach

- Resolve a suitable journey using profile, normalized URL, and any reference association.
- Add its existing view to the appropriate view layer.
- Set the new bounds.
- Mark the journey `visible`.
- Update its recency.
- Do not call `loadURL()` on a cache hit.

### Destroy

- Detach the view if necessary.
- Close `webContents`.
- Remove listeners, handles, world state, journey metadata, and live associations.
- Emit the cache-state change.

Deleting a notebook reference removes its reference association. It must not automatically destroy a shared journey, because other references or recently visited URLs may still resolve to it. A journey becomes eligible for normal eviction when detached; it may be destroyed immediately only when no policy considers it reusable.

### Resolve

- Determine the reference's profile and normalized URL.
- Prefer its last suitable live association when available.
- Otherwise choose the most recent suitable detached association from the profile/URL index.
- If no live association is suitable, create a fresh journey and load the URL.
- Never reuse a journey across profiles.

### Activate an older page in a journey

- If the requested URL is the journey's current document, attach it directly.
- If it corresponds to a retained navigation entry, navigate to that entry and accept best-effort restoration.
- If the association is stale or ambiguous, load the requested URL in a fresh journey rather than surprising the user with the wrong page state.
- Preserve the journey's Chromium history. A Digest-specific activation boundary is deferred unless user testing demonstrates a concrete need.

## Identity and relationships

Digest currently uses layout-qualified IDs: an inline view uses `blockId`, while a full view uses `blockId:full`. Ephemeral URLs use synthetic IDs derived from URL. These conventions conflate durable references, destinations, browser identity, and placement.

The preferred relationship is:

```text
notebook reference ── URL ──┐
                            ├── profile/URL live index ── browsing journey
ephemeral URL route ── URL ─┘                              │
                                                          └── placement
                                                              detached | inline | full
```

- Use an opaque `journeyId` as the browser/cache key.
- Use a separate stable reference ID where a notebook link or block can provide one.
- Pass layout and bounds as placement data.
- Reattach and resize the same journey when presentation changes.
- Do not derive a unique browser identity from URL; identical URLs can have independent live state.
- Do not create a new view merely because a page is added to the notebook.

## Retiring creation previews

The existing site-block notification loads a separate `${blockId}-preview` view and destroys it when the animation ends. It was intended to provide feedback when a page block was created in the background, but command-click no longer follows that path: it inserts an inline link and emits a separate link-capture event.

The preview system should not be adopted into the live-page cache. It creates an extra browser identity and page load for transient feedback. Adding a notebook reference should associate it with the active journey when possible, not create or warm a second view for the reference.

Removing the preview system also simplifies the identity consolidation work: there is no `${blockId}-preview` identity to migrate or transfer.

## IPC and renderer state

The renderer needs a read-only projection of cache membership. It should not infer liveness from mounted React components.

Conceptual messages (final names may follow the existing IPC conventions):

```ts
// Renderer -> main
browser:open-reference { referenceId?, url, profileId, bounds, layout }
browser:update-placement { journeyId, bounds, layout }
browser:detach-journey { journeyId }
browser:destroy-journey { journeyId }
browser:get-live-reference-state { references: Array<{ referenceId, url, profileId }> }

// Main -> renderer
browser:live-reference-state-changed {
  references: Array<{ referenceId, isLive }>
}
```

The main process must resolve URLs and associations. The renderer should not choose a `journeyId` by deriving it from a block or URL.

Sending a complete projection is preferable while the cache is small. It makes initial synchronization, missed-event recovery, and renderer reloads straightforward. Inline references will require stable renderer-visible reference IDs if their dots need to distinguish identical URLs; URL-only projection is an acceptable early fallback.

A renderer context or external store can expose:

```ts
const liveReferences = useLiveReferenceState();
const isLive = liveReferences.has(reference.id);
```

The main process should send an initial snapshot after the renderer subscribes. It should also emit after journey creation, association changes, eviction, explicit destruction, and renderer/view recovery.

## Green-dot indicator

The dot communicates one precise fact: clicking this link can resume a live in-memory page.

Recommended presentation:

- A 6–8 px green circle before the URL.
- Vertically aligned with the link text.
- Tooltip or accessible label: “Page is kept live.”
- A restrained color and no pulsing animation.
- A brief fade on appearance or eviction is acceptable but not required.

The indicator should not mean “online,” “loaded before,” “saved,” or “available offline.” It must disappear as soon as the live `WebContents` is destroyed.

Because the dot represents runtime state, it must be rendered from the live-reference projection rather than added to any notebook prop schema.

## Retiring `scrollPercent`

The custom scroll mechanism currently:

- injects a `scrollend` listener into each page;
- sends the scroll percentage through console messages and IPC;
- persists it in the site's BlockNote props;
- injects a later `window.scrollTo()` restoration script.

This can be removed after live reuse is proven reliable and the product accepts that evicted pages reopen without retained scroll state.

A safe migration sequence is:

1. Add the live cache while leaving `scrollPercent` as a fallback.
2. Use live views on cache hits and skip manual scroll restoration for them.
3. Validate live-cache behavior and explicitly verify the fresh-load experience after eviction.
4. Stop writing new `scrollPercent` values.
5. Remove the prop and injected tracking in a later document/schema migration.

Existing blocks containing the prop can tolerate it as ignored legacy data during the transition.

## Memory and process considerations

Ten live journeys may still be expensive. Chromium renderer processes can consume significant memory, and multiple views can share or split processes depending on site isolation.

The initial policy is a fixed limit of ten because it is predictable and easy to explain. Follow-up safeguards may include:

- Evicting crashed or unresponsive views first.
- Evicting entries under critical memory pressure.
- Suspending media when a view is detached.
- Respecting Page Visibility and Electron background throttling.
- Exposing the limit as an advanced preference only if actual usage shows a need.

The cache should never create or retain journeys used only for transient preview feedback.

## Failure handling

- **Cached renderer crashed:** destroy the entry, clear the dot, and open a fresh journey with `loadURL()`.
- **Profile changed:** never reuse the journey. A `WebContents` cannot switch Electron session partitions after creation.
- **URL association is stale:** remove the association and open a fresh journey; do not guess at a different page.
- **Reference deleted:** remove its association without destroying a journey that may be shared or otherwise reusable.
- **Document changed externally:** reconcile reference associations without making document synchronization own Electron side effects.
- **Attach failure:** clear the stale entry and retry with a newly created view.
- **Application shutdown:** close all views normally; dots disappear naturally on the next process start.
- **Renderer reload:** main remains authoritative and returns a fresh live-reference projection.

## Measurement and cache effectiveness

The first unified reference-opening implementation must record cache resolution outcomes in SQLite. The purpose is to measure whether retaining live journeys avoids enough page loads to justify its memory cost and to distinguish URL-shape misses from capacity, lifecycle, and correctness failures.

Record one attempt for every user-initiated reference open at the unified `open-reference` decision point. Do not record only inside the URL index's `resolve()` method: the final outcome may change because an association is stale, a renderer crashed, navigation-history restoration failed, or attachment failed.

Suggested schema:

```sql
CREATE TABLE live_page_cache_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL,
  session_id TEXT NOT NULL,
  profile_hash TEXT NOT NULL,
  reference_kind TEXT NOT NULL,
  outcome TEXT NOT NULL,
  miss_reason TEXT,
  match_class TEXT NOT NULL,
  candidate_count INTEGER NOT NULL,
  cache_size INTEGER NOT NULL,
  detached_count INTEGER NOT NULL,
  association_age_ms INTEGER,
  reused_journey INTEGER NOT NULL,
  load_avoided INTEGER NOT NULL,
  requested_url_hash TEXT NOT NULL,
  normalized_url_hash TEXT NOT NULL,
  hostname TEXT,
  has_query INTEGER NOT NULL,
  query_key_count INTEGER NOT NULL,
  has_fragment INTEGER NOT NULL
);

CREATE INDEX idx_live_page_cache_attempts_timestamp
  ON live_page_cache_attempts(timestamp);
CREATE INDEX idx_live_page_cache_attempts_outcome
  ON live_page_cache_attempts(outcome, miss_reason);
```

Initial outcome vocabulary:

- `hit_current`: the requested page is the journey's current live document and is attached without loading.
- `hit_history`: a retained navigation entry is selected and restored without a fresh `loadURL()`.
- `miss`: no suitable live page is reused.

Initial miss reasons:

- `no_association`: the profile/URL index has no exact association and no eviction tombstone.
- `evicted`: a suitable association existed earlier in the session but its journey was evicted.
- `profile_mismatch`: a matching URL exists only in another profile and therefore must not be reused.
- `stale_association`: indexed journey or navigation-entry state is no longer usable.
- `ambiguous`: available candidates cannot be selected safely.
- `renderer_unavailable`: the associated renderer crashed or was destroyed.
- `attach_failed`: reuse was selected but attaching or restoring it failed.

`match_class` is diagnostic and must never change resolution behavior. On a miss, compare the requested URL with live associations in the same profile and classify the nearest structural relationship as `exact`, `fragment_only`, `query_only`, `query_and_fragment`, `path_variant`, or `unrelated`. This will show how many misses might be attributable to URL noise without making aggressive normalization part of the initial cache policy.

Keep lightweight, session-only eviction tombstones containing the profile hash, normalized URL hash, and eviction time. Tombstones make `evicted` distinguishable from `no_association`; they must not retain a `WebContents`, navigation state, or a reusable journey association.

Telemetry must not store complete URLs by default. URLs may contain search text, document identifiers, authentication material, or other private state. Persist hashes for exact correlation plus the hostname and coarse structural fields needed for analysis. If full URLs are temporarily needed during local development, that must be an explicit debug-only option and not the production default.

The primary product metric is `load_avoided`, not the broader lookup hit rate. A nominal association that ultimately calls `loadURL()` did not provide the feature's main benefit. Supporting metrics should include:

- exact hit rate and load-avoided rate;
- miss reasons and diagnostic match classes;
- hit rate by cache occupancy, association age, profile, and reference kind;
- evictions followed by a later request for the evicted URL;
- the estimated effect of alternative cache limits using recorded occupancy and eviction data.

Do not relax URL normalization based on anecdotes. Collect enough reference-open attempts to identify a stable pattern. Known tracking parameters may later be removed through a narrow allowlist if the data shows meaningful benefit. Query strings, fragments, or path components must not be discarded generically because they may represent application state.

## Implementation status: July 21, 2026

The first useful vertical slice is working for both legacy site blocks and normal notebook links:

- `BrowsingJourneyStore` owns opaque journey identity, placement relationships, conservative URL associations, profile isolation, and per-profile bounded LRU policy.
- Full-page ephemeral URL routes are retained as live journeys. “Ephemeral” now describes route durability rather than whether the browser runtime may be cached.
- Leaving a retained page detaches its `WebContentsView`; reopening the same normalized URL in the same profile reattaches it without `loadURL()`.
- Current-document reuse is intentionally distinct from an older URL merely visited by the journey. Older-history restoration is not implemented yet.
- `ViewStore.openReference()` is the authoritative main-process opening workflow used by the existing renderer update channel.
- Opening policy and miss classification live in the functional core (`BrowsingJourneyStore` and `LivePageOpenPolicy`); `ViewStore` orchestrates the workflow, `Interpreter` executes Electron view effects, and placement changes are committed only after attachment succeeds.
- Attachment failure and destroyed renderer paths discard stale journey state and fall back to fresh creation.
- Migration 8 creates `live_page_cache_attempts`. Opens record privacy-conscious `hit_current` or `miss` outcomes, miss reasons, hashed URL/profile identity, cache occupancy, and `load_avoided` without storing complete URLs.
- Application logs confirmed repeated normal-link opens detach and reattach the same live journey with no second `Creating new view` or `Loading URL` event.
- The renderer now receives a complete runtime-only projection of current live pages keyed by profile and normalized URL. The initial snapshot is fetched through IPC, and the main process republishes it after creation, reuse, navigation, detach, eviction, and destruction.
- Site blocks and ordinary inline notebook links render a restrained green dot when their profile and URL resolve to a current live page. The indicator has the accessible description and tooltip “Page is kept live.”
- Liveness is not written into BlockNote props or SQLite notebook content. Journey and handle identity remain main-process implementation details.
- `NotificationLayer` owns renderer IPC for live-reference, placement-ready, navigation, and browser-selection events. `ViewStore` decides when domain changes warrant notification but does not access renderer `WebContents` or call `send()` directly.
- Logical Back boundaries are deferred and are no longer required for the next implementation stages.
- Manual `scrollPercent` capture, persistence, and restoration remain active as a fallback pending the Stage 7 validation and cleanup.

Remaining work is primarily older-history association, richer miss diagnostics and eviction tombstones, reference reconciliation, and removal of manual scroll persistence after broader validation.

## Proposed implementation stages

### Stage 1: Preserve the working lifecycle prototype

- [x] Keep explicit detach and destroy operations.
- [x] Keep detached views in the handle registry.
- [x] Retain deterministic LRU tests and the rule that visible views are never evicted.
- [x] Do not add more block-ID ownership assumptions to the prototype.

### Stage 2: Introduce journey identity

- [x] Add opaque `journeyId` identity independent of block ID, URL, and layout.
- [x] Make `BrowsingJourneyStore` own handle associations and LRU state while Electron handles remain in `HandleRegistry`.
- [x] Treat renderer IDs as placements that may resolve to a retained journey handle.
- [x] Scope journey lookup and reuse by profile.

### Stage 3: Add profile/URL associations

- [x] Add a conservative URL normalizer.
- [x] Index zero or more live associations by `(profileId, normalizedUrl)`.
- [ ] Track navigation entry identity or index where Electron exposes enough information.
- [x] Update the index as a journey navigates without mutating its originating notebook reference.
- [x] Prefer the most recent suitable current-document association while allowing multiple instances of one URL.

### Stage 4: Unify reference opening

- [x] Route legacy site blocks and normal notebook URL routes through one `openReference` operation; inline links currently enter through the URL route.
- [x] Add the SQLite cache-attempt migration and record the final outcome at this operation.
- [ ] Add the complete diagnostic near-match classification and session-only eviction tombstones. Current telemetry distinguishes exact candidates from unrelated misses.
- [x] Reuse a suitable current-document journey or create a fresh journey on a miss.
- [ ] Restore older navigation entries on best-effort history hits.
- [ ] Reconcile explicit reference deletion separately from view eviction.
- [x] Validate core planning, profile diagnostics, retention policy, and telemetry privacy with focused tests and smoke assertions.

Logical Back boundaries are deferred. They should only be reconsidered if preserved Chromium history causes a concrete navigation UX problem.

### Stage 5: Surface liveness in the notebook

Status: completed July 21, 2026. The first projection is URL-based within a profile, so references to the same normalized URL share the same live indication. Stable per-inline-reference identity remains unnecessary until references need to distinguish multiple live instances of one URL.

- [x] Replace block-ID snapshots with a profile-and-URL live-reference projection.
- [x] Render the accessible green dot for site blocks and inline links that resolve to a suitable live association.
- [x] Keep the projection entirely in runtime IPC/renderer state; notebook persistence includes no live flag, journey ID, or association.
- [x] Emit refreshed projections after lifecycle and navigation changes so indicators do not become stale.
- [x] Keep renderer IPC side effects in `NotificationLayer` rather than `ViewStore`.

### Stage 6: Remove legacy preview notifications

Status: preview cleanup completed July 20, 2026; active-journey association and command-click feedback remain separate follow-up work.

- [x] Remove the site-block preview component and its browser view lifecycle.
- [x] Remove the old block-notification provider, container, hook, layout reservation, and route row.
- [x] Remove the unreachable `browser:new-block` / `browser:create-block` producer chain and its editor, preload, main-process, and renderer API wiring.
- [ ] Improve command-click feedback through the existing link-capture path without creating a browser view.
- [ ] Associate newly added references with the active journey without creating a preview or second view.

### Stage 7: Remove manual scroll persistence

Status: not started. All capture, persistence, IPC, and restoration paths are still active.

- [ ] Smoke-test live reuse and the fresh-load experience after eviction.
- [ ] Stop writing `scrollPercent` after validation.
- [ ] Remove injected scroll tracking and restoration.
- [ ] Remove associated IPC and renderer hooks.
- [ ] Retain compatibility with existing documents during migration.

## Testing strategy

### Unit tests

- Inserting journeys beyond a profile's limit evicts the least recently used detached journey.
- Activating an older journey updates its recency.
- Visible journeys are never selected for eviction.
- Identical URLs in different profiles never resolve to the same journey.
- Multiple associations for one profile/URL remain distinguishable and deterministic.
- Deleting one reference does not destroy a journey shared by another reference.
- Stale associations are removed without returning the wrong journey.
- Live-reference projections contain exactly the references that currently resolve to suitable live associations.
- Cache attempts classify current-document hits, history hits, and each miss reason deterministically.
- Diagnostic near-match classification never changes the journey selected by exact resolution.
- Eviction tombstones classify later opens as `evicted` and expire with the application session.
- Telemetry hashes URLs and does not persist complete paths, queries, or fragments.

### Integration tests

- Open a page, scroll and interact, leave it, and reopen its reference without another network navigation.
- Navigate within a page, leave, reopen, and verify back/forward history remains intact.
- Open A, navigate to B, add B to the notebook, and verify both references associate with the same journey.
- Deferred: if logical Back boundaries are reintroduced, verify Digest Back cannot cross an activation boundary.
- Verify internal navigation never mutates the notebook reference that opened the journey.
- Exceed the journey limit and verify every reference dependent on the evicted journey loses its dot.
- Reopen an older journey before exceeding the limit and verify a different journey is evicted.
- Reload the Electron renderer and verify dots resynchronize from main-process state.
- Delete one of two references into a journey and verify the other association and `WebContents` survive.
- Verify pages in different profile partitions never reuse the wrong view.
- Verify every user-initiated reference open produces exactly one final cache-attempt row.
- Force stale, crashed, ambiguous, evicted, and attach-failure paths and verify their recorded outcomes.
- Verify `load_avoided` is false whenever reuse falls back to `loadURL()`.

### Visual/accessibility checks

- The dot aligns correctly with long and wrapped URLs.
- The link remains keyboard accessible.
- The live state has a text alternative or tooltip and does not rely solely on color for assistive technology.
- Dot transitions do not shift the surrounding editor layout noticeably.

## Open questions

1. Should the limit be ten journeys per profile or ten journeys total with profile-aware lookup? Per-profile isolation is required; the memory budget may still need a global ceiling.
2. Should recency update on attach, detach, navigation, or page interaction? Attach and detach are sufficient initially.
3. How should Digest identify a repeated URL within one journey when Electron navigation entries do not expose a durable entry ID?
4. When should a profile/URL association be considered unsuitable despite remaining live?
5. Should adding a reference capture only the current URL association, or also a reference-specific navigation-entry hint?
6. Should the visual indicator distinguish an exact current live document from a best-effort older navigation entry? Initially, one green dot is simpler, but its meaning must not overpromise exact state.
7. How many reference-open attempts are required before changing URL normalization or the cache-size policy?
8. What retention period should apply to cache-attempt telemetry, and should users have a control to clear or disable it?

## Recommended initial decisions

- Opaque journey identity independent of references, URLs, and layout.
- Profile-isolated lookup with a bounded number of live journeys and LRU eviction.
- `(profileId, normalizedUrl)` as a non-unique, recency-ordered lookup index.
- Preserve Chromium history on live reuse; defer Digest-specific logical Back boundaries unless user testing demonstrates a need.
- Reference deletion removes associations rather than automatically destroying journeys.
- One green dot for both visible and detached live pages.
- Runtime-only liveness state owned by the main process.
- No retention or restoration of Chromium navigation state after eviction or restart.
- Keep `scrollPercent` temporarily as a fallback, then remove it after validation.
- Remove notification previews rather than adopting their temporary views into the cache.
- Persist privacy-conscious cache-attempt telemetry from the first unified reference-opening rollout.
- Treat `load_avoided` as the primary effectiveness metric and keep near-match analysis diagnostic-only.
- Use session-only eviction tombstones to separate capacity misses from URLs that were never cached.

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

After live reuse is validated and fresh loading after eviction is accepted, remove:

- the `scrollPercent` site-block prop;
- `browser:set-scroll-percent` and `browser:save-scroll-percent` IPC;
- `setScrollPercent()` preload and renderer API declarations;
- injected scroll tracking and restoration in `Interpreter`;
- the scroll update effect in `useRendererEditor`;
- the pending-scroll map and related `ViewStore` methods.

This cleanup remains staged until the live-cache behavior and the fresh-load experience after eviction are validated.
