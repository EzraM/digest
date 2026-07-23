# Browser Presentation Consistency Plan

## Purpose

Make webpage-to-notebook and notebook-to-webpage transitions converge reliably
across React, the router, renderer IPC, main-process journey state, native
`WebContentsView` handles, view-layer membership, and renderer notifications.

This plan narrows the broader browser lifecycle roadmap to the identity and
cross-boundary consistency failure observed on July 23, 2026.

## Observed failure

During a real transition, the renderer requested the placement:

```text
ephemeral-.../browse/PD-3772:full
```

The native layer manager attached the retained handle:

```text
ephemeral-.../browse/PS-5606:full
```

The renderer was then notified that the `PD-3772` placement was loaded.

This is an identity-consistency failure. A placement, retained journey, native
handle, and notification can each be internally valid while referring to
different browser instances. The gray screen is the user-visible result of that
split-brain state.

The system currently coordinates several imperative side effects:

1. Change the renderer route.
2. Mount or unmount a browser placement.
3. Send an IPC update or detach request.
4. Resolve a placement to a retained journey or native handle.
5. Attach or remove a native view.
6. Notify the renderer of load and placement state.

There is no single transaction across those boundaries, and success at one
boundary does not establish agreement at the others.

## Target model

### Canonical identities

Keep these identities distinct and explicit:

```text
routeId -> placementId -> journeyId -> handleId
```

- `routeId`: the renderer navigation that expresses user intent.
- `placementId`: one visible presentation slot and its bounds/layout.
- `journeyId`: one retained browsing history and live page runtime.
- `handleId`: one native `WebContentsView` owned by the main process.

A URL is a lookup attribute, not an identity. A notebook reference is a durable
reference, not a native-view owner.

Every command, effect result, notification, invariant report, and diagnostic log
must carry enough identity information to reconstruct this mapping.

### Retire layout-qualified ownership identities

The current `blockId:full` convention may remain temporarily as a readable,
renderer-local key for “this reference in this layout.” It must not remain the
canonical identity of a placement, journey, native handle, or notification
stream.

Layout is placement data, not browser identity:

```ts
type Placement = {
  placementId: PlacementId;
  referenceId?: ReferenceId;
  layout: "inline" | "full";
  transitionGeneration: number;
};

type Journey = {
  journeyId: JourneyId;
  handleId: HandleId;
};
```

For the single full-page browser surface, prefer a stable slot such as:

```text
primary-browser -> journey-17 -> handle-9
```

Opening a different reference changes the journey occupying
`primary-browser`; it does not derive a new native identity from the reference
URL, block ID, or `:full` suffix.

Inline placements should also receive opaque placement identities and carry
their reference ID and layout as explicit fields. A mount or transition
generation fences each placement instance.

During migration:

- Permit `blockId:full` only at renderer-local compatibility boundaries.
- Convert it immediately into typed placement data before crossing IPC.
- Do not pass layout-qualified IDs to journey stores, handle registries, native
  layer management, or browser-event notification routing.
- Remove `resolveHandleId()` behavior that silently treats placement IDs as
  aliases for differently named retained handles.
- Log and test the explicit placement-to-journey-to-handle mapping instead.

### Contract discipline

Keep cross-boundary contracts small and make invalid or ambiguous states
unrepresentable.

- Treat optional compatibility fields and fallback values as temporary migration
  scaffolding, not as the final contract.
- Do not use `blockId`, `viewId`, placement generation, or a sentinel such as
  generation `0` as a fallback for a missing route, placement, journey, handle,
  or transition identity.
- Require each command to carry only the identities and data needed to perform
  that command. Prefer focused command DTOs over one large request type shared by
  unrelated operations.
- Use explicit discriminated unions only where the operation genuinely has
  distinct states. Avoid adding transitional states that can instead be modeled
  as an acknowledgement status or an internal reconciliation detail.
- Validate compatibility input once at the renderer/main boundary and convert it
  into a strict internal command. Internal services must not accept the
  compatibility shape.
- After all producers have migrated, make `routeId`, `placementId`, `layout`, and
  `transitionGeneration` required where applicable; remove `viewId`,
  layout-qualified identity fallbacks, optional generation fallbacks, and their
  associated branches.
- Add compile-time contract tests or fixtures for every IPC producer so a newly
  optional identity field or legacy fallback cannot be reintroduced unnoticed.

### Single authority

The main process owns authoritative browser presentation state because it owns
the native handles and layer membership.

The renderer requests desired presentation:

```ts
type DesiredPresentation =
  | {
      kind: "notebook";
      documentId: string;
      transitionGeneration: number;
    }
  | {
      kind: "browser";
      routeId: string;
      placementId: string;
      referenceId?: string;
      profileId: string;
      url: string;
      bounds: Bounds;
      layout: "inline" | "full";
      transitionGeneration: number;
    };
```

The main process reconciles observed journey, handle, and layer state until it
matches the accepted desired state. React mount cleanup is a lifecycle signal,
not the authority that decides the final presentation.

### Fenced transitions

Use one monotonically increasing `transitionGeneration` across the complete
route-to-native transition.

- Main accepts only the newest desired presentation.
- Attach, detach, bounds, load, navigation, and notification messages carry the
  accepted generation.
- An older generation cannot detach, attach, resize, notify, or declare readiness
  for a newer transition.
- Repeated commands for the same generation are idempotent.

Placement generations may remain useful for component instances, but they must
not substitute for the end-to-end transition generation.

## Required invariants

### Identity

- One visible placement maps to exactly one journey and one live handle.
- One native handle is attached to at most one visible placement.
- A notification's placement, journey, handle, and generation match the active
  authoritative mapping.
- Journey reuse never changes the requested placement identity in an
  unobservable or implicit way.
- A journey is never reused across profiles.

### Presentation

- Desired notebook implies zero attached browser handles.
- Desired browser implies exactly one attached handle for its active full-page
  placement.
- A transition is not reported ready until observed native state satisfies the
  desired presentation.
- Renderer route state and authoritative presentation state eventually converge.

### Ordering

- Cleanup from an older React mount cannot affect a newer transition.
- Delayed browser events cannot publish readiness for a retired placement.
- Duplicate IPC commands and acknowledgements are harmless.
- A failed attach, detach, or history preparation remains recoverable through
  reconciliation.

## Implementation phases

### Phase 1: Turn the observed trace into a regression

- Add a deterministic integration trace in which a requested placement resolves
  to a retained journey whose handle ID differs from the placement ID.
- Reproduce the `PD-3772 -> PS-5606` sequence, including the incorrectly addressed
  ready notification.
- Assert the complete identity mapping rather than only the final journey state.
- Add the trace to the shared replay format used by lifecycle fuzzing.

Exit criteria:

- The regression fails against the current behavior for the specific identity
  disagreement.
- Its failure output contains route, placement, journey, handle, and generation.

### Phase 2: Make identity mappings first-class

- Introduce opaque `journeyId` and `handleId` where internal code currently uses
  a placement ID as both.
- Replace `blockId:full` and other layout-qualified IDs with opaque placement IDs
  plus explicit `referenceId`, `layout`, and generation fields at the IPC
  boundary.
- Give the single full-page browser surface a stable placement-slot identity;
  change the journey occupying that slot instead of deriving a placement or
  handle identity from each URL.
- Store an explicit active-placement record instead of resolving aliases
  implicitly at arbitrary call sites.
- Replace APIs that accept an ambiguous `viewId` with APIs whose parameter names
  and types state whether they expect a placement, journey, or handle.
- Add structured mapping logs at resolve, prepare, attach, detach, destroy, and
  notify boundaries.
- Fail closed when a mapping is missing or contradictory; create a fresh journey
  rather than presenting an unrelated retained page.
- Split the compatibility `OpenReferenceRequest` from the strict internal open
  command. Keep the internal command small, use `placementId` rather than
  `viewId`, and require its identity, layout, and generation fields.
- Inventory and migrate every request producer, then delete optional identity
  fallbacks and sentinel defaults.

Exit criteria:

- No main-process operation has to guess whether an ID names a placement or a
  native handle.
- No journey, native handle, or notification stream is keyed by `blockId:full`.
- The observed mismatch becomes an immediate invariant error.
- Main-process services accept only strict, focused command types; the legacy
  compatibility request exists only at the IPC adapter or has been removed.
- Missing route, placement, layout, or transition identity is rejected at the
  boundary rather than represented as an additional internal state.

### Phase 3: Add an end-to-end transition generation

- Allocate a generation when user intent changes between notebook and browser.
- Carry it through route state, placement updates, main-process desired state,
  native effects, and renderer notifications.
- Track a high-water mark in the authoritative presentation controller.
- Reject or ignore all effects and notifications from retired generations.
- Preserve idempotency for retries within the current generation.

Exit criteria:

- Delayed attach, detach, bounds, navigation, and ready events cannot mutate or
  notify a newer presentation.
- Deterministic queue tests cover every stale-message class.

### Phase 4: Introduce desired-state reconciliation

- Add a main-process `PresentationController` with desired and observed state.
- Convert renderer open/back actions into `setDesiredPresentation` requests.
- Reconcile native layer membership, journey visibility, handle ownership, and
  bounds from that state.
- Make attach and detach return observable results.
- After each effect, re-read or update observed state and continue reconciliation
  until the invariant holds or a bounded retry policy produces an explicit error.
- Treat React cleanup as advisory release of a component placement, fenced by its
  generation.

Exit criteria:

- `show notebook` is successful only when no browser handle is attached.
- `show browser` is successful only when the intended journey/handle occupies the
  intended placement.
- Reissuing either intent converges without creating duplicate views.

### Phase 5: Acknowledgements and renderer projection

- Return an authoritative presentation acknowledgement after convergence:

```ts
type PresentationAcknowledgement = {
  transitionGeneration: number;
  desiredKind: "notebook" | "browser";
  routeId?: string;
  placementId?: string;
  journeyId?: string;
  handleId?: string;
  attachedBrowserHandleIds: string[];
  status: "converged" | "reconciling" | "error";
  error?: string;
};
```

- Drive renderer loading/ready UI from current-generation acknowledgements.
- Publish complete authoritative projections on subscription and renderer reload.
- Do not translate a journey event into a placement notification unless the
  current mapping and generation still match.

Exit criteria:

- The renderer can recover from missed notifications by requesting one snapshot.
- A ready notification proves agreement rather than merely reporting that some
  retained handle loaded.

### Phase 6: Cross-boundary invariant and fuzz coverage

- Extend the deterministic scheduler to model route requests, desired-state
  acceptance, mapping changes, native effects, acknowledgements, browser events,
  React cleanup, duplicate IPC, and renderer reload.
- Randomize valid message delays and duplication.
- Assert global invariants after every delivered event.
- Include multiple same-URL journeys, different placement/handle IDs, competing
  routes, cache reuse, attach failure, renderer crash, and eviction.
- Persist the shortest failing trace or provide a deterministic reducer.

Exit criteria:

- Fuzzing detects any placement/journey/handle/notification disagreement.
- Every failure prints a replayable seed and identity-rich trace.
- The fixed `PD-3772 -> PS-5606` regression remains in the fast suite.

### Phase 7: Real Electron transition verification

- Add a deterministic local webpage fixture.
- Exercise notebook -> webpage -> notebook and cached reactivation in a dedicated
  Electron test profile.
- Verify authoritative acknowledgements and native child membership.
- Capture a screenshot and lifecycle trace on failure.
- Repeat transitions with randomized delays and retained journeys.

Exit criteria:

- Packaged Electron verifies the final user-visible transition, not only the fake
  state machines.
- A gray screen produces a correlated identity trace and screenshot automatically.

## Near-term implementation order

1. Add the exact identity-mismatch regression.
2. Define strict, focused command contracts and typed route, placement, journey,
   and handle identities behind a temporary IPC compatibility adapter.
3. Migrate all producers, remove optional identity fallbacks, and replace
   layout-qualified ownership IDs with opaque placements and explicit
   layout data.
4. Delete the compatibility contract, centralize the active mapping, and
   eliminate ambiguous `viewId` resolution.
5. Add transition generations and fence every boundary.
6. Add the authoritative presentation controller and reconciler.
7. Address renderer readiness through convergence acknowledgements.
8. Extend invariant fuzzing.
9. Add the packaged Electron smoke test.

## Rollout strategy

- Keep the current browser lifecycle behind the existing composition boundary.
- Introduce the presentation controller behind a development feature flag if the
  migration cannot be atomic.
- Run old and new decision logic in shadow mode first, logging disagreements
  without performing duplicate native effects.
- Switch native effects to the new controller after deterministic and fuzz
  regressions pass.
- Remove legacy alias resolution and unmount-driven authority after Electron
  transition tests pass.

## Definition of done

The work is complete when:

- User intent has one accepted authoritative presentation generation.
- Route, placement, journey, handle, layer membership, and notification identity
  are explicitly correlated.
- Notebook and browser transitions converge idempotently from delayed,
  duplicated, or stale messages.
- Global invariants are checked by deterministic and randomized tests.
- A real Electron test verifies the visible webpage-to-notebook transition.
- The observed `PD-3772 -> PS-5606` class of mismatch cannot reach the renderer as
  a successful placement notification.
