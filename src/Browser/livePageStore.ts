import { useSyncExternalStore } from "react";

export type LiveReference = { profileId: string; url: string };

let liveReferenceKeys = new Set<string>();
let initialized = false;
const listeners = new Set<() => void>();

export function liveReferenceKey(profileId: string, url: string): string {
  let normalizedUrl = url.trim();
  try {
    normalizedUrl = new URL(normalizedUrl).href;
  } catch {
    // Keep invalid or application-specific URLs byte-for-byte after trimming.
  }
  return `${profileId}\u0000${normalizedUrl}`;
}

function publish(references: LiveReference[]): void {
  liveReferenceKeys = new Set(
    references.map(({ profileId, url }) => liveReferenceKey(profileId, url))
  );
  for (const listener of listeners) listener();
}

function initialize(): void {
  if (initialized) return;
  initialized = true;

  window.electronAPI.onLivePagesChanged(({ references }) => publish(references));
  void window.electronAPI.browser
    .getLivePages()
    .then(({ references }) => publish(references))
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
  return liveReferenceKeys;
}

export function useLiveReferenceKeys(): ReadonlySet<string> {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function useIsLivePage(profileId: string, url: string): boolean {
  const referenceKeys = useLiveReferenceKeys();
  return referenceKeys.has(liveReferenceKey(profileId, url));
}
