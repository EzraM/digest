# Browser Lifecycle Verification Roadmap

## Purpose

Digest coordinates React components, renderer IPC, main-process state, native
`WebContentsView` instances, Electron sessions, and asynchronous browser events.
The live-page cache makes those relationships longer-lived and therefore makes
ownership and ordering bugs easier to expose.

Pure state tests are necessary but insufficient. A valid implementation must
also remain correct when messages are duplicated, delayed, dropped, or delivered
after a component, placement, view, or renderer has been replaced.

This document describes the next phases for making browser lifecycle behavior
observable, controllable, fuzzable, and eventually testable in packaged Electron.

## Current baseline: July 22, 2026

The current work establishes the first testing seams:

- `BrowsingJourneyStore` and the browser-view reducer are pure and have seeded
  randomized tests.
- Renderer placements carry monotonically increasing generations. Main rejects
  delayed updates and detach messages from older mounts.
- Placement generation high-water marks survive detach, preventing a delayed
  update from resurrecting a retired mount.
- `EventTranslator.attach()` returns a disposer, and view destruction disposes
  the Electron event listeners installed for that view.
- Download handling attaches once per Electron `Session`, not once per
  `WebContentsView`.
- `ViewStore` accepts an injected clock, journey store, and live-page projection
  store. Its native effects, notifications, event attachment, handle operations,
  handle registry, and context-menu registration are also injectable ports.
- A fake-native integration test drives the complete `ViewStore` orchestration
  through create, resize, detach, cache hit, reattach, and destroy.
- The fast suite includes deterministic queued-delivery tests as well as pure
  store tests.

The fast fuzz suite currently runs 100 deterministic seeds with 500 operations
per randomized lifecycle test. This is useful regression coverage, but it does
not yet simulate a real Electron process or renderer.

All randomized lifecycle tests use the same replay controls:

```bash
DIGEST_FUZZ_SEED=4001 DIGEST_FUZZ_STEPS=1000 yarn test:fuzz
DIGEST_FUZZ_SEEDS=1000 DIGEST_FUZZ_STEPS=500 yarn test:fuzz
```

An explicit seed runs one replayable schedule. Without one, `DIGEST_FUZZ_SEEDS`
controls the consecutive range beginning at seed 1.

## Required invariants

Every phase should strengthen or verify these invariants:

### Identity and placement

- One live handle has at most one active placement.
- One placement resolves to at most one live handle.
- Cleanup from an older React mount cannot detach or destroy a newer mount.
- An update from a retired mount cannot recreate or reattach a view.
- A journey is never reused across profiles.

### Native resource ownership

- A handle registry entry corresponds to one non-destroyed `WebContentsView`.
- Destroying a view removes its handle and disposes view-scoped listeners.
- Detaching a view retains the handle and the listeners required for its live
  browser journey.
- Session-scoped services install at most one listener per Electron session.
- Cache eviction eventually closes the selected detached renderer.

### State agreement

- Main-process placement state agrees with the native view layer.
- A green-dot projection never claims that a destroyed renderer is live.
- A successful cache hit does not call `loadURL()`.
- A failed attachment or stale history entry produces a fresh load and exactly
  one final telemetry outcome.
- Renderer reload can obtain a complete authoritative projection from main.

### Responsiveness and user actions

- Notification-driven layout changes resize the native view without detaching,
  hiding, or recreating it.
- Async link capture cannot insert into an unrelated notebook position after a
  route change.
- Missing notebook anchors produce an explicit, recoverable outcome.
- Browser, main renderer, and main process remain responsive during repeated
  create, detach, attach, resize, and eviction cycles.

## Phase 1: Complete the controllable main-process shell

### Goal

Make `ViewStore` runnable with fake native effects rather than requiring actual
Electron objects.

### Work

- Define narrow interfaces for browser effects, handle queries, renderer
  notifications, event attachment, and session services.
- Inject those ports into `ViewStore`; keep Electron-backed adapters as the
  production defaults.
- Inject the clock and ID generation everywhere cooldowns, recency, or operation
  identity depends on time.
- Replace implicit construction inside `ViewStore` with a production composition
  function.
- Give every create, attach, detach, and destroy effect an observable result.
- Make disposal idempotent and observable in tests.

### Exit criteria

- A test can instantiate the complete `ViewStore` orchestration without Electron.
- Tests can assert every native effect and notification in order.
- No test needs private-field access or real time.

## Phase 2: Deterministic queued-event simulation

### Goal

Model concurrency as an explicit queue whose delivery order can be controlled and
replayed.

### Event vocabulary

- Renderer mount update and bounds update.
- Renderer unmount/detach.
- Create success or failure.
- Attach success or failure.
- Load start, navigation, redirect, load failure, load stop, and renderer crash.
- Notification-driven bounds changes.
- History entry selection success or staleness.
- Cache eviction.
- Renderer reload and projection resubscription.
- Async link-title and link-capture completion.
- Duplicate and dropped IPC messages.

### Work

- Add a virtual scheduler with named queues for renderer IPC, Electron callbacks,
  and asynchronous application work.
- Record every generated event and effect in a replayable trace.
- Randomize delivery order only within valid causal constraints.
- Shrink failures to the shortest useful event trace, or provide a deterministic
  trace reducer if a property-testing library remains unavailable.
- Standardize `DIGEST_FUZZ_SEED`, seed start, seed count, and operation count across
  every randomized test.

### Exit criteria

- Every failure reports a seed and complete replay trace.
- A single command replays one failed schedule.
- The simulator covers every required invariant without real Electron.

## Phase 3: Resource-ownership stress tests

### Goal

Prove that long-lived cached journeys do not accumulate native resources.

### Work

- Create and destroy hundreds of fake views across several shared profile
  sessions.
- Assert bounded listener counts for downloads and other session services.
- Assert view-scoped listeners are retained across detach and removed on destroy.
- Track handles, layer membership, event disposers, pending creates, and cache
  associations as explicit resource counters.
- Exercise eviction while navigation and renderer events remain queued.
- Add crash and unresponsive-view prioritization when policy is implemented.

### Exit criteria

- Resource counters return to baseline after destruction.
- Detached cache occupancy never exceeds policy after an eligible eviction point.
- No `MaxListenersExceededWarning` occurs in stress runs.

## Phase 4: Renderer and layout integration harness

### Goal

Exercise the React-to-main boundary, including the layout transition visible in
the July 22 failure.

### Work

- Mount `Page`, `PageToolSlotProvider`, link-capture notifications, and the route
  view in a renderer test environment.
- Provide controllable `ResizeObserver`, `IntersectionObserver`, animation frame,
  and IPC implementations.
- Generate notification appearance/removal while a live page is visible.
- Verify bounds messages remain associated with the current placement generation.
- Test Strict Mode mount/cleanup behavior and renderer hot/full reload.
- Give async link capture an operation identity and a defined destination policy
  when its original notebook anchor is unavailable.

### Exit criteria

- Notification-driven resizing never detaches or replaces the live journey.
- Stale React cleanup and stale resize callbacks are rejected.
- Link capture has tested success, missing-anchor, route-change, and cancellation
  outcomes.

## Phase 5: Real Electron smoke and stress runner

### Goal

Verify assumptions that fakes cannot prove: native z-order, session behavior,
Chromium history restoration, renderer processes, and responsiveness.

### Work

- Add a deterministic local test page with controls for scrolling, forms,
  navigation, popups, downloads, delayed loads, and renderer crashes.
- Launch Digest in a dedicated test profile and drive it through an Electron-aware
  automation layer.
- Repeatedly open, detach, reattach, resize, and evict journeys.
- Verify retained DOM/form/scroll state on hits and fresh state after eviction.
- Record process responsiveness, listener warnings, renderer count, load count,
  and cache telemetry rows.
- Capture screenshots and lifecycle traces on failure.

### Exit criteria

- The core cache scenarios pass in a packaged build.
- Cache hits demonstrably avoid network/page loads.
- Native view z-order and bounds remain correct through notification transitions.
- Stress runs complete without renderer hangs or unbounded resource growth.

## Phase 6: Continuous verification tiers

### Fast suite — every change

- Pure reducers and stores.
- Deterministic lifecycle queue.
- 100 stable seeds at 500 operations each.
- Target runtime: seconds.

### Extended suite — CI or pre-merge

- 1,000 configurable seeds.
- Multiple profiles, evictions, crashes, and duplicated IPC.
- Renderer/layout integration tests.
- Target runtime: a few minutes.

### Electron stress suite — nightly and release candidates

- Packaged application.
- Long-running native lifecycle and memory/listener checks.
- Persisted traces, screenshots, logs, and telemetry database on failure.
- Fixed regression seeds plus a rotating random seed range.

## Near-term implementation order

1. Finish extracting `ViewStore` effect ports and production composition.
2. Build the deterministic scheduler and trace format.
3. Move the existing placement/journey fuzzers onto the shared seed configuration.
4. Add delayed load, crash, attach-failure, eviction, and renderer-reload events.
5. Specify and test async link-capture destination behavior.
6. Build the deterministic local browser fixture.
7. Add packaged Electron smoke automation.

## Definition of done

This work is complete when a lifecycle failure can be reproduced from an
automatically captured trace, the same scenario can be exercised against both
the fake shell and packaged Electron, and the suite verifies state correctness,
native resource ownership, renderer responsiveness, and user-visible browser
continuity.
