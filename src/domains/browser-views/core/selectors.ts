import { ViewWorld, ViewEntry, LoadState } from './types';

export const getView = (world: ViewWorld, id: string): ViewEntry | undefined =>
  world.get(id);

export const getLoadState = (world: ViewWorld, id: string): LoadState =>
  world.get(id)?.loadState ?? { type: 'idle' };

export const hasError = (world: ViewWorld, id: string): boolean =>
  world.get(id)?.loadState.type === 'error';

export const isLoading = (world: ViewWorld, id: string): boolean =>
  world.get(id)?.loadState.type === 'loading';

export const canRetry = (world: ViewWorld, id: string): boolean =>
  world.get(id)?.loadState.type === 'error';

export const getAllIds = (world: ViewWorld): string[] =>
  Array.from(world.keys());
