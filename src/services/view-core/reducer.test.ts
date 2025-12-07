import { reduce } from './reducer';
import { emptyWorld } from './types';

describe('ViewWorld reducer', () => {
  it('creates a view in loading state', () => {
    const world = reduce(emptyWorld, {
      type: 'create',
      id: 'block-1',
      url: 'https://example.com',
      bounds: { x: 0, y: 0, width: 800, height: 600 },
      profile: 'default',
    });

    expect(world.get('block-1')).toEqual({
      url: 'https://example.com',
      bounds: { x: 0, y: 0, width: 800, height: 600 },
      profile: 'default',
      status: { type: 'loading' },
    });
  });

  it('does NOT override error with ready (the key bug)', () => {
    let world = reduce(emptyWorld, {
      type: 'create',
      id: 'block-1',
      url: 'https://example.com',
      bounds: { x: 0, y: 0, width: 800, height: 600 },
      profile: 'default',
    });

    world = reduce(world, {
      type: 'markError',
      id: 'block-1',
      code: -6,
      message: 'ERR_CONNECTION_REFUSED',
    });

    // This is the bug: did-finish-load fires after did-fail-load
    world = reduce(world, {
      type: 'markReady',
      id: 'block-1',
      canGoBack: false,
    });

    // Error should NOT be overridden
    expect(world.get('block-1')?.status).toEqual({
      type: 'error',
      code: -6,
      message: 'ERR_CONNECTION_REFUSED',
    });
  });

  it('allows explicit retry from error state', () => {
    let world = reduce(emptyWorld, {
      type: 'create',
      id: 'block-1',
      url: 'https://example.com',
      bounds: { x: 0, y: 0, width: 800, height: 600 },
      profile: 'default',
    });

    world = reduce(world, {
      type: 'markError',
      id: 'block-1',
      code: -6,
      message: 'ERR_CONNECTION_REFUSED',
    });

    world = reduce(world, { type: 'retry', id: 'block-1' });

    expect(world.get('block-1')?.status).toEqual({ type: 'loading' });
  });

  it('updates bounds without affecting other properties', () => {
    let world = reduce(emptyWorld, {
      type: 'create',
      id: 'block-1',
      url: 'https://example.com',
      bounds: { x: 0, y: 0, width: 800, height: 600 },
      profile: 'default',
    });

    world = reduce(world, {
      type: 'updateBounds',
      id: 'block-1',
      bounds: { x: 10, y: 20, width: 900, height: 700 },
    });

    const view = world.get('block-1');
    expect(view?.bounds).toEqual({ x: 10, y: 20, width: 900, height: 700 });
    expect(view?.url).toBe('https://example.com');
    expect(view?.profile).toBe('default');
  });

  it('updates URL without affecting other properties', () => {
    let world = reduce(emptyWorld, {
      type: 'create',
      id: 'block-1',
      url: 'https://example.com',
      bounds: { x: 0, y: 0, width: 800, height: 600 },
      profile: 'default',
    });

    world = reduce(world, {
      type: 'updateUrl',
      id: 'block-1',
      url: 'https://newurl.com',
    });

    const view = world.get('block-1');
    expect(view?.url).toBe('https://newurl.com');
    expect(view?.bounds).toEqual({ x: 0, y: 0, width: 800, height: 600 });
  });

  it('removes a view from the world', () => {
    let world = reduce(emptyWorld, {
      type: 'create',
      id: 'block-1',
      url: 'https://example.com',
      bounds: { x: 0, y: 0, width: 800, height: 600 },
      profile: 'default',
    });

    world = reduce(world, { type: 'remove', id: 'block-1' });

    expect(world.get('block-1')).toBeUndefined();
    expect(world.size).toBe(0);
  });

  it('does not override error with loading', () => {
    let world = reduce(emptyWorld, {
      type: 'create',
      id: 'block-1',
      url: 'https://example.com',
      bounds: { x: 0, y: 0, width: 800, height: 600 },
      profile: 'default',
    });

    world = reduce(world, {
      type: 'markError',
      id: 'block-1',
      code: -6,
      message: 'ERR_CONNECTION_REFUSED',
    });

    world = reduce(world, {
      type: 'markLoading',
      id: 'block-1',
    });

    expect(world.get('block-1')?.status).toEqual({
      type: 'error',
      code: -6,
      message: 'ERR_CONNECTION_REFUSED',
    });
  });

  it('transitions from loading to ready', () => {
    let world = reduce(emptyWorld, {
      type: 'create',
      id: 'block-1',
      url: 'https://example.com',
      bounds: { x: 0, y: 0, width: 800, height: 600 },
      profile: 'default',
    });

    expect(world.get('block-1')?.status.type).toBe('loading');

    world = reduce(world, {
      type: 'markReady',
      id: 'block-1',
      canGoBack: true,
    });

    expect(world.get('block-1')?.status).toEqual({
      type: 'ready',
      canGoBack: true,
    });
  });

  it('ignores commands for non-existent views', () => {
    const world = reduce(emptyWorld, {
      type: 'updateBounds',
      id: 'non-existent',
      bounds: { x: 0, y: 0, width: 100, height: 100 },
    });

    expect(world).toBe(emptyWorld);
  });

  it('only allows retry from error state', () => {
    let world = reduce(emptyWorld, {
      type: 'create',
      id: 'block-1',
      url: 'https://example.com',
      bounds: { x: 0, y: 0, width: 800, height: 600 },
      profile: 'default',
    });

    // Try to retry from loading state - should not change
    world = reduce(world, { type: 'retry', id: 'block-1' });
    expect(world.get('block-1')?.status.type).toBe('loading');

    // Mark as ready
    world = reduce(world, {
      type: 'markReady',
      id: 'block-1',
      canGoBack: false,
    });

    // Try to retry from ready state - should not change
    world = reduce(world, { type: 'retry', id: 'block-1' });
    expect(world.get('block-1')?.status).toEqual({
      type: 'ready',
      canGoBack: false,
    });
  });
});
