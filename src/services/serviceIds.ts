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
} as const;

export type ServiceId = (typeof SERVICE_IDS)[keyof typeof SERVICE_IDS];

/**
 * Startup order for eagerly initialized services.
 *
 * Dependencies are still enforced by the container graph, but this sequence
 * makes startup intent explicit and easier to review.
 */
export const CORE_SERVICE_BOOT_ORDER: readonly ServiceId[] = [
  SERVICE_IDS.DATABASE,
  SERVICE_IDS.EVENT_LOGGER,
  SERVICE_IDS.PROFILE_MANAGER,
  SERVICE_IDS.DOCUMENT_MANAGER,
  SERVICE_IDS.DEBUG_EVENT_SERVICE,
  SERVICE_IDS.ASSET_SERVICE,
  SERVICE_IDS.SEARCH_INDEX_MANAGER,
  SERVICE_IDS.BRAVE_SEARCH_SERVICE,
] as const;
