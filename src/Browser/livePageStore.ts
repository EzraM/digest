import { useSyncExternalStore } from "react";
import { LivePagesProjection } from "../types/browser";

let liveReferenceKeys = new Set<string>();
let currentRevision = -1;
let initialized = false;
const listeners = new Set<() => void>();
let liveIndicatorProfileId = "";

export function liveReferenceKey(profileId: string, url: string): string {
  let normalizedUrl = url.trim();
  try {
    normalizedUrl = new URL(normalizedUrl).href;
  } catch {
    // Keep invalid or application-specific URLs byte-for-byte after trimming.
  }
  return `${profileId}\u0000${normalizedUrl}`;
}

function publish({ revision, references }: LivePagesProjection): void {
  if (revision <= currentRevision) return;
  currentRevision = revision;
  liveReferenceKeys = new Set(
    references.map(({ profileId, url }) => liveReferenceKey(profileId, url))
  );
  for (const listener of listeners) listener();
}

function initialize(): void {
  if (initialized) return;
  initialized = true;

  window.electronAPI.onLivePagesChanged(publish);
  void window.electronAPI.browser
    .getLivePages()
    .then(publish)
    .catch((error) => {
      console.error("Failed to read live page cache state:", error);
    });
}

export function subscribeToLivePageState(
  listener: () => void
): () => void {
  initialize();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): ReadonlySet<string> {
  return liveReferenceKeys;
}

export function setLiveIndicatorProfileId(profileId: string): void {
  if (profileId === liveIndicatorProfileId) return;
  liveIndicatorProfileId = profileId;
  for (const listener of listeners) listener();
}

export function isLiveIndicatorUrl(url: string): boolean {
  return liveReferenceKeys.has(liveReferenceKey(liveIndicatorProfileId, url));
}

export function useLiveReferenceKeys(): ReadonlySet<string> {
  return useSyncExternalStore(
    subscribeToLivePageState,
    getSnapshot,
    getSnapshot
  );
}

export function useIsLivePage(profileId: string, url: string): boolean {
  const referenceKeys = useLiveReferenceKeys();
  return referenceKeys.has(liveReferenceKey(profileId, url));
}
