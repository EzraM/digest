/**
 * Canonical service identifiers used by the dependency container.
 *
 * Keeping IDs in one place avoids ad-hoc string literals and makes it
 * easier to swap implementations while preserving stable interfaces.
 */
export const SERVICE_IDS = {
  DATABASE: "database",
  EVENT_LOGGER: "eventLogger",
  BLOCK_OPERATION_SERVICE: "blockOperationService",
  PROFILE_MANAGER: "profileManager",
  DOCUMENT_MANAGER: "documentManager",
  DEBUG_EVENT_SERVICE: "debugEventService",
  BLOCK_EVENT_MANAGER: "blockEventManager",
  IMAGE_SERVICE: "imageService",
  SEARCH_INDEX_MANAGER: "searchIndexManager",
  BRAVE_SEARCH_SERVICE: "braveSearchService",
  BLOCK_PRE_WRITE_MIDDLEWARES: "blockPreWriteMiddlewares",
  BLOCK_POST_WRITE_MIDDLEWARES: "blockPostWriteMiddlewares",
  BLOCK_MIDDLEWARE_PIPELINE: "blockMiddlewarePipeline",
  BLOCK_OPERATIONS_APPLIER: "blockOperationsApplier",
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
  SERVICE_IDS.BLOCK_OPERATION_SERVICE,
  SERVICE_IDS.PROFILE_MANAGER,
  SERVICE_IDS.DOCUMENT_MANAGER,
  SERVICE_IDS.DEBUG_EVENT_SERVICE,
  SERVICE_IDS.BLOCK_EVENT_MANAGER,
  SERVICE_IDS.IMAGE_SERVICE,
  SERVICE_IDS.SEARCH_INDEX_MANAGER,
  SERVICE_IDS.BRAVE_SEARCH_SERVICE,
  SERVICE_IDS.BLOCK_PRE_WRITE_MIDDLEWARES,
  SERVICE_IDS.BLOCK_POST_WRITE_MIDDLEWARES,
  SERVICE_IDS.BLOCK_MIDDLEWARE_PIPELINE,
  SERVICE_IDS.BLOCK_OPERATIONS_APPLIER,
] as const;
