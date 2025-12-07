import { ViewWorld, ViewEntry, ViewStatus } from './types';

export const getView = (world: ViewWorld, id: string): ViewEntry | undefined =>
  world.get(id);

export const getStatus = (world: ViewWorld, id: string): ViewStatus =>
  world.get(id)?.status ?? { type: 'idle' };

export const hasError = (world: ViewWorld, id: string): boolean =>
  world.get(id)?.status.type === 'error';

export const isLoading = (world: ViewWorld, id: string): boolean =>
  world.get(id)?.status.type === 'loading';

export const canRetry = (world: ViewWorld, id: string): boolean =>
  world.get(id)?.status.type === 'error';

export const getAllIds = (world: ViewWorld): string[] =>
  Array.from(world.keys());
