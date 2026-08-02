/**
 * Canonical service identifiers used by the dependency container.
 *
 * Keeping IDs in one place avoids ad-hoc string literals and makes it
 * easier to swap implementations while preserving stable interfaces.
 */
export const SERVICE_IDS = {
  DATABASE: "database",
  EVENT_LOGGER: "eventLogger",
  PROFILE_MANAGER: "profileManager",
  DOCUMENT_MANAGER: "documentManager",
  DEBUG_EVENT_SERVICE: "debugEventService",
  ASSET_SERVICE: "assetService",
  SEARCH_INDEX_MANAGER: "searchIndexManager",
  BRAVE_SEARCH_SERVICE: "braveSearchService",
  SCHEDULER: "digest.scheduler",
  OPEN_EXTERNAL: "electron.open-external",
} as const;

export type ServiceId = (typeof SERVICE_IDS)[keyof typeof SERVICE_IDS];
