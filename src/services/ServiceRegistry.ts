import { Container } from "./Container";
import { CORE_SERVICE_BOOT_ORDER, SERVICE_IDS } from "./serviceIds";
import { DatabaseManager } from "../database/DatabaseManager";
import { initializeEventLogger } from "./EventLogger";
import {
  BlockOperationService,
  BlockEventManager,
  BlockMiddlewarePipelineImpl,
  BlockOperationsApplier,
} from "../domains/blocks/services";
import { getDebugEventService, DebugEventService } from "./DebugEventService";
import type {
  BlockMiddlewarePipeline,
  IBlockPostWriteMiddleware,
  IBlockPreWriteMiddleware,
} from "../domains/blocks/core/middleware";
import { log } from "../utils/mainLogger";
import { ProfileManager } from "./ProfileManager";
import { DocumentManager } from "./DocumentManager";
import { ImageService } from "./ImageService";
import { SearchIndexManager } from "../domains/search/services/SearchIndexManager";
import { BraveSearchService } from "../domains/search/services/BraveSearchService";
import type Database from "better-sqlite3";

/**
 * Service registry that defines all application services and their dependencies
 * This is where we explicitly declare the dependency graph
 */
export function registerServices(container: Container): void {
  // Database - foundational service with no dependencies
  container.register(SERVICE_IDS.DATABASE, {
    version: "1.0.0",
    factory: async () => {
      log.debug("Initializing database service", "ServiceRegistry");
      const dbManager = DatabaseManager.getInstance();
      await dbManager.initialize();
      return dbManager.getDatabase();
    },
  });

  // EventLogger - depends on database
  container.register(SERVICE_IDS.EVENT_LOGGER, {
    version: "1.0.0",
    dependencies: [SERVICE_IDS.DATABASE],
    factory: async (c) => {
      log.debug("Initializing EventLogger service", "ServiceRegistry");
      const database = await c.resolve<Database.Database>(
        SERVICE_IDS.DATABASE
      );
      return initializeEventLogger(database);
    },
  });

  // BlockOperationService - depends on database (eventLogger resolved lazily)
  container.register(SERVICE_IDS.BLOCK_OPERATION_SERVICE, {
    version: "1.0.0",
    dependencies: [SERVICE_IDS.DATABASE],
    factory: async (c) => {
      log.debug("Initializing BlockOperationService", "ServiceRegistry");
      const database = await c.resolve<Database.Database>(
        SERVICE_IDS.DATABASE
      );
      BlockOperationService.setDatabase(database);
      return BlockOperationService.getInstance("default", database);
    },
  });

  // ProfileManager - depends on database
  container.register(SERVICE_IDS.PROFILE_MANAGER, {
    version: "1.0.0",
    dependencies: [SERVICE_IDS.DATABASE],
    factory: async (c) => {
      log.debug("Initializing ProfileManager service", "ServiceRegistry");
      const database = await c.resolve<Database.Database>(
        SERVICE_IDS.DATABASE
      );
      return new ProfileManager(database);
    },
  });

  // DocumentManager - depends on database and profileManager
  container.register(SERVICE_IDS.DOCUMENT_MANAGER, {
    version: "1.0.0",
    dependencies: [SERVICE_IDS.DATABASE, SERVICE_IDS.PROFILE_MANAGER],
    factory: async (c) => {
      log.debug("Initializing DocumentManager service", "ServiceRegistry");
      const database = await c.resolve<Database.Database>(
        SERVICE_IDS.DATABASE
      );
      const profileManager = (await c.resolve(
        SERVICE_IDS.PROFILE_MANAGER
      )) as ProfileManager;
      return new DocumentManager(database, profileManager);
    },
  });

  // DebugEventService - depends on eventLogger being available
  container.register(SERVICE_IDS.DEBUG_EVENT_SERVICE, {
    version: "1.0.0",
    dependencies: [SERVICE_IDS.EVENT_LOGGER],
    factory: async () => {
      log.debug("Initializing DebugEventService", "ServiceRegistry");
      // EventLogger is guaranteed to be initialized at this point
      return getDebugEventService();
    },
  });

  // BlockEventManager - depends on eventLogger and blockOperationService
  container.register(SERVICE_IDS.BLOCK_EVENT_MANAGER, {
    version: "1.0.0",
    dependencies: [SERVICE_IDS.EVENT_LOGGER, SERVICE_IDS.BLOCK_OPERATION_SERVICE],
    factory: async () => {
      log.debug("Initializing BlockEventManager", "ServiceRegistry");
      // EventLogger is guaranteed to be initialized at this point
      return BlockEventManager.getInstance();
    },
  });

  // ImageService - depends on database
  container.register(SERVICE_IDS.IMAGE_SERVICE, {
    version: "1.0.0",
    dependencies: [SERVICE_IDS.DATABASE],
    factory: async (c) => {
      log.debug("Initializing ImageService", "ServiceRegistry");
      const database = await c.resolve<Database.Database>(
        SERVICE_IDS.DATABASE
      );
      return ImageService.getInstance(database);
    },
  });

  // SearchIndexManager - depends on database
  container.register(SERVICE_IDS.SEARCH_INDEX_MANAGER, {
    version: "1.0.0",
    dependencies: [SERVICE_IDS.DATABASE],
    factory: async (c) => {
      log.debug("Initializing SearchIndexManager", "ServiceRegistry");
      const database = await c.resolve<Database.Database>(
        SERVICE_IDS.DATABASE
      );
      // Use FTS5 for full-text search (works offline, no API key required)
      return SearchIndexManager.initialize(database, {
        searchProvider: "fts5",
      });
    },
  });

  // BraveSearchService - no deps; uses getEnvVar("BRAVE_SEARCH_API_KEY")
  container.register(SERVICE_IDS.BRAVE_SEARCH_SERVICE, {
    version: "1.0.0",
    dependencies: [],
    factory: async () => {
      log.debug("Initializing BraveSearchService", "ServiceRegistry");
      return new BraveSearchService();
    },
  });

  // Block middleware: pre-write (transform) and post-write (observe)
  container.register(SERVICE_IDS.BLOCK_PRE_WRITE_MIDDLEWARES, {
    version: "1.0.0",
    dependencies: [],
    factory: async (): Promise<never[]> => {
      log.debug("Initializing blockPreWriteMiddlewares", "ServiceRegistry");
      return [];
    },
  });

  container.register(SERVICE_IDS.BLOCK_POST_WRITE_MIDDLEWARES, {
    version: "1.0.0",
    dependencies: [SERVICE_IDS.IMAGE_SERVICE, SERVICE_IDS.SEARCH_INDEX_MANAGER],
    factory: async (c) => {
      log.debug("Initializing blockPostWriteMiddlewares", "ServiceRegistry");
      const imageService = (await c.resolve(SERVICE_IDS.IMAGE_SERVICE)) as ImageService;
      const searchIndexManager = (await c.resolve(
        SERVICE_IDS.SEARCH_INDEX_MANAGER
      )) as SearchIndexManager;

      const imageMiddleware: IBlockPostWriteMiddleware = {
        afterApply: async (operations) => {
          for (const op of operations) {
            const changes =
              (op as { changes?: Array<{ type: string; block?: unknown }> })
                .changes ?? [];
            const deletions = changes.filter((c) => c.type === "delete");
            for (const deletion of deletions) {
              const block = deletion.block;
              if (!block) continue;
              const imageIds = ImageService.extractImageIdsFromBlock(block);
              for (const imageId of imageIds) {
                const deleted = imageService.deleteImage(imageId);
                if (deleted) {
                  log.debug(
                    `Cleaned up image ${imageId} for deleted block`,
                    SERVICE_IDS.BLOCK_POST_WRITE_MIDDLEWARES
                  );
                }
              }
            }
          }
        },
      };

      const searchMiddleware: IBlockPostWriteMiddleware = {
        afterApply: async (operations, _result, context) => {
          await searchIndexManager.indexOperations(
            operations,
            context.documentId
          );
        },
      };

      return [imageMiddleware, searchMiddleware];
    },
  });

  container.register(SERVICE_IDS.BLOCK_MIDDLEWARE_PIPELINE, {
    version: "1.0.0",
    dependencies: [SERVICE_IDS.BLOCK_PRE_WRITE_MIDDLEWARES, SERVICE_IDS.BLOCK_POST_WRITE_MIDDLEWARES],
    factory: async (c) => {
      log.debug("Initializing blockMiddlewarePipeline", "ServiceRegistry");
      const pre = (await c.resolve(
        SERVICE_IDS.BLOCK_PRE_WRITE_MIDDLEWARES
      )) as IBlockPreWriteMiddleware[];
      const post = (await c.resolve(
        SERVICE_IDS.BLOCK_POST_WRITE_MIDDLEWARES
      )) as IBlockPostWriteMiddleware[];
      return new BlockMiddlewarePipelineImpl(pre, post);
    },
  });

  container.register(SERVICE_IDS.BLOCK_OPERATIONS_APPLIER, {
    version: "1.0.0",
    dependencies: [SERVICE_IDS.DOCUMENT_MANAGER, SERVICE_IDS.BLOCK_MIDDLEWARE_PIPELINE],
    factory: async (c) => {
      log.debug("Initializing blockOperationsApplier", "ServiceRegistry");
      const documentManager = (await c.resolve(
        SERVICE_IDS.DOCUMENT_MANAGER
      )) as DocumentManager;
      const pipeline = (await c.resolve(
        SERVICE_IDS.BLOCK_MIDDLEWARE_PIPELINE
      )) as BlockMiddlewarePipeline;
      return new BlockOperationsApplier(documentManager, pipeline);
    },
  });
}

/**
 * Initialize all core services in dependency order
 * Call this once during app startup
 */
export async function initializeAllServices(
  container: Container
): Promise<void> {
  log.debug("Starting service initialization", "ServiceRegistry");

  // Resolve services sequentially to avoid race conditions
  // (Container handles dependencies automatically)
  for (const serviceId of CORE_SERVICE_BOOT_ORDER) {
    await container.resolve(serviceId);
  }

  log.debug("All services initialized successfully", "ServiceRegistry");
}

/**
 * Get typed service instances (convenience methods)
 */
export function getServices(container: Container) {
  return {
    database: container.get(SERVICE_IDS.DATABASE),
    eventLogger: container.get(SERVICE_IDS.EVENT_LOGGER),
    blockOperationService: container.get(
      SERVICE_IDS.BLOCK_OPERATION_SERVICE
    ) as BlockOperationService,
    debugEventService: container.get(SERVICE_IDS.DEBUG_EVENT_SERVICE) as DebugEventService,
    blockEventManager: container.get(SERVICE_IDS.BLOCK_EVENT_MANAGER) as BlockEventManager,
    profileManager: container.get(SERVICE_IDS.PROFILE_MANAGER) as ProfileManager,
    documentManager: container.get(SERVICE_IDS.DOCUMENT_MANAGER) as DocumentManager,
    imageService: container.get(SERVICE_IDS.IMAGE_SERVICE) as ImageService,
    searchIndexManager: container.get(
      SERVICE_IDS.SEARCH_INDEX_MANAGER
    ) as SearchIndexManager,
    braveSearchService: container.get(
      SERVICE_IDS.BRAVE_SEARCH_SERVICE
    ) as BraveSearchService,
    blockOperationsApplier: container.get(
      SERVICE_IDS.BLOCK_OPERATIONS_APPLIER
    ) as BlockOperationsApplier,
  };
}
