# View Core - Pure Functional Core

This directory contains the pure functional core of the ViewManager refactoring. It has **zero Electron dependencies** and is **100% testable** with simple assertions.

## Architecture Philosophy

Following the "Functional Core, Imperative Shell" pattern, this core is:
- **Pure**: All functions are deterministic with no side effects
- **Immutable**: State changes produce new immutable data structures
- **Testable**: No mocks needed - just data in, data out
- **Simple**: ~100 lines of essential logic

## Files

### `types.ts`
Core data model representing browser views as values:
- `ViewWorld`: Immutable map of view states
- `ViewEntry`: A view's URL, bounds, profile, and status
- `ViewStatus`: Union type for loading, ready, error, or idle states
- `Rect`: Simple rectangle bounds

### `commands.ts`
All possible state transitions as data:
- `create`: Add a new view
- `updateBounds`: Change view dimensions
- `updateUrl`: Update view URL
- `remove`: Remove a view
- `markLoading`: Transition to loading state
- `markReady`: Transition to ready state
- `markError`: Transition to error state
- `retry`: Explicit retry from error state

### `reducer.ts`
Pure state transition function: `(world, command) → world`

**Key insight**: The reducer prevents the "error override bug" by construction:
```typescript
case 'markReady':
  // Don't override error with ready (prevents the race condition)
  if (existing.status.type === 'error') return world;
  // ...
```

This single guard makes the race condition between `did-fail-load` and `did-finish-load` impossible.

### `selectors.ts`
Query functions for reading from the world:
- `getView`: Get a view entry by ID
- `getStatus`: Get status for a view
- `hasError`: Check if view has error
- `isLoading`: Check if view is loading
- `canRetry`: Check if retry is allowed
- `getAllIds`: Get all view IDs

### `reducer.test.ts`
Comprehensive tests for the reducer including:
- Basic CRUD operations
- The critical "error override" bug prevention test
- State transition validation
- Edge cases

## Usage

```typescript
import { emptyWorld, reduce } from '@/domains/browser-views/core';

// Start with empty world
let world = emptyWorld;

// Dispatch commands to change state
world = reduce(world, {
  type: 'create',
  id: 'block-1',
  url: 'https://example.com',
  bounds: { x: 0, y: 0, width: 800, height: 600 },
  profile: 'default',
});

// State transitions are validated
world = reduce(world, {
  type: 'markError',
  id: 'block-1',
  code: -6,
  message: 'ERR_CONNECTION_REFUSED',
});

// This won't override the error (the bug fix!)
world = reduce(world, {
  type: 'markReady',
  id: 'block-1',
  canGoBack: false,
});

// Explicit retry is required to recover from error
world = reduce(world, { type: 'retry', id: 'block-1' });
```

## Testing

Since this is pure code with no dependencies, tests are simple:

```typescript
it('prevents the error-override bug', () => {
  let world = reduce(emptyWorld, createCmd);
  world = reduce(world, errorCmd);
  world = reduce(world, readyCmd);  // The race!
  expect(world.get('id')?.status.type).toBe('error');
});
```

No mocks. No async. No Electron. Just pure data transformations.

## Benefits

1. **The bug is impossible**: State transition rules prevent error override
2. **Easy to test**: Pure functions need no setup or teardown
3. **Easy to debug**: Log commands, replay sequences, snapshot state
4. **Easy to understand**: ~50 lines of essential complexity
