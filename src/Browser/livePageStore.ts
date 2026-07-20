import { useSyncExternalStore } from "react";

let liveBlockIds = new Set<string>();
let initialized = false;
const listeners = new Set<() => void>();

function publish(blockIds: string[]): void {
  liveBlockIds = new Set(blockIds);
  for (const listener of listeners) listener();
}

function initialize(): void {
  if (initialized) return;
  initialized = true;

  window.electronAPI.onLivePagesChanged(({ blockIds }) => publish(blockIds));
  void window.electronAPI.browser
    .getLivePages()
    .then(({ blockIds }) => publish(blockIds))
    .catch((error) => {
      console.error("Failed to read live page cache state:", error);
    });
}

function subscribe(listener: () => void): () => void {
  initialize();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): ReadonlySet<string> {
  return liveBlockIds;
}

export function useIsLivePage(blockId: string): boolean {
  const blockIds = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return blockIds.has(blockId);
}
