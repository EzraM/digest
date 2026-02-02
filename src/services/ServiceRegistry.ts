import { Container } from "./Container";
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

/**
 * Service registry that defines all application services and their dependencies
 * This is where we explicitly declare the dependency graph
 */
export function registerServices(container: Container): void {
  // Database - foundational service with no dependencies
  container.register("database", {
    version: "1.0.0",
    factory: async () => {
      log.debug("Initializing database service", "ServiceRegistry");
      const dbManager = DatabaseManager.getInstance();
      await dbManager.initialize();
      return dbManager.getDatabase();
    },
  });

  // EventLogger - depends on database
  container.register("eventLogger", {
    version: "1.0.0",
    dependencies: ["database"],
    factory: async (c) => {
      log.debug("Initializing EventLogger service", "ServiceRegistry");
      const database = await c.resolve("database");
      return initializeEventLogger(database);
    },
  });

  // BlockOperationService - depends on database (eventLogger resolved lazily)
  container.register("blockOperationService", {
    version: "1.0.0",
    dependencies: ["database"],
    factory: async (c) => {
      log.debug("Initializing BlockOperationService", "ServiceRegistry");
      const database = await c.resolve("database");
      BlockOperationService.setDatabase(database);
      return BlockOperationService.getInstance("default", database);
    },
  });

  // ProfileManager - depends on database
  container.register("profileManager", {
    version: "1.0.0",
    dependencies: ["database"],
    factory: async (c) => {
      log.debug("Initializing ProfileManager service", "ServiceRegistry");
      const database = await c.resolve("database");
      return new ProfileManager(database);
    },
  });

  // DocumentManager - depends on database and profileManager
  container.register("documentManager", {
    version: "1.0.0",
    dependencies: ["database", "profileManager"],
    factory: async (c) => {
      log.debug("Initializing DocumentManager service", "ServiceRegistry");
      const database = await c.resolve("database");
      const profileManager = (await c.resolve(
        "profileManager"
      )) as ProfileManager;
      return new DocumentManager(database, profileManager);
    },
  });

  // DebugEventService - depends on eventLogger being available
  container.register("debugEventService", {
    version: "1.0.0",
    dependencies: ["eventLogger"],
    factory: async () => {
      log.debug("Initializing DebugEventService", "ServiceRegistry");
      // EventLogger is guaranteed to be initialized at this point
      return getDebugEventService();
    },
  });

  // BlockEventManager - depends on eventLogger and blockOperationService
  container.register("blockEventManager", {
    version: "1.0.0",
    dependencies: ["eventLogger", "blockOperationService"],
    factory: async () => {
      log.debug("Initializing BlockEventManager", "ServiceRegistry");
      // EventLogger is guaranteed to be initialized at this point
      return BlockEventManager.getInstance();
    },
  });

  // ImageService - depends on database
  container.register("imageService", {
    version: "1.0.0",
    dependencies: ["database"],
    factory: async (c) => {
      log.debug("Initializing ImageService", "ServiceRegistry");
      const database = await c.resolve("database");
      return ImageService.getInstance(database);
    },
  });

  // SearchIndexManager - depends on database
  container.register("searchIndexManager", {
    version: "1.0.0",
    dependencies: ["database"],
    factory: async (c) => {
      log.debug("Initializing SearchIndexManager", "ServiceRegistry");
      const database = await c.resolve("database");
      // Use FTS5 for full-text search (works offline, no API key required)
      return SearchIndexManager.initialize(database, {
        searchProvider: "fts5",
      });
    },
  });

  // BraveSearchService - no deps; uses getEnvVar("BRAVE_SEARCH_API_KEY")
  container.register("braveSearchService", {
    version: "1.0.0",
    dependencies: [],
    factory: async () => {
      log.debug("Initializing BraveSearchService", "ServiceRegistry");
      return new BraveSearchService();
    },
  });

  // Block middleware: pre-write (transform) and post-write (observe)
  container.register("blockPreWriteMiddlewares", {
    version: "1.0.0",
    dependencies: [],
    factory: async (): Promise<never[]> => {
      log.debug("Initializing blockPreWriteMiddlewares", "ServiceRegistry");
      return [];
    },
  });

  container.register("blockPostWriteMiddlewares", {
    version: "1.0.0",
    dependencies: ["imageService", "searchIndexManager"],
    factory: async (c) => {
      log.debug("Initializing blockPostWriteMiddlewares", "ServiceRegistry");
      const imageService = (await c.resolve("imageService")) as ImageService;
      const searchIndexManager = (await c.resolve(
        "searchIndexManager"
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
                    "blockPostWriteMiddlewares"
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

  container.register("blockMiddlewarePipeline", {
    version: "1.0.0",
    dependencies: ["blockPreWriteMiddlewares", "blockPostWriteMiddlewares"],
    factory: async (c) => {
      log.debug("Initializing blockMiddlewarePipeline", "ServiceRegistry");
      const pre = (await c.resolve(
        "blockPreWriteMiddlewares"
      )) as IBlockPreWriteMiddleware[];
      const post = (await c.resolve(
        "blockPostWriteMiddlewares"
      )) as IBlockPostWriteMiddleware[];
      return new BlockMiddlewarePipelineImpl(pre, post);
    },
  });

  container.register("blockOperationsApplier", {
    version: "1.0.0",
    dependencies: ["documentManager", "blockMiddlewarePipeline"],
    factory: async (c) => {
      log.debug("Initializing blockOperationsApplier", "ServiceRegistry");
      const documentManager = (await c.resolve(
        "documentManager"
      )) as DocumentManager;
      const pipeline = (await c.resolve(
        "blockMiddlewarePipeline"
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
  await container.resolve("database");
  await container.resolve("eventLogger");
  await container.resolve("blockOperationService");
  await container.resolve("profileManager");
  await container.resolve("documentManager");
  await container.resolve("debugEventService");
  await container.resolve("blockEventManager");
  await container.resolve("imageService");
  await container.resolve("searchIndexManager");
  await container.resolve("braveSearchService");
  await container.resolve("blockPreWriteMiddlewares");
  await container.resolve("blockPostWriteMiddlewares");
  await container.resolve("blockMiddlewarePipeline");
  await container.resolve("blockOperationsApplier");

  log.debug("All services initialized successfully", "ServiceRegistry");
}

/**
 * Get typed service instances (convenience methods)
 */
export function getServices(container: Container) {
  return {
    database: container.get("database"),
    eventLogger: container.get("eventLogger"),
    blockOperationService: container.get(
      "blockOperationService"
    ) as BlockOperationService,
    debugEventService: container.get("debugEventService") as DebugEventService,
    blockEventManager: container.get("blockEventManager") as BlockEventManager,
    profileManager: container.get("profileManager") as ProfileManager,
    documentManager: container.get("documentManager") as DocumentManager,
    imageService: container.get("imageService") as ImageService,
    searchIndexManager: container.get(
      "searchIndexManager"
    ) as SearchIndexManager,
    braveSearchService: container.get(
      "braveSearchService"
    ) as BraveSearchService,
    blockOperationsApplier: container.get(
      "blockOperationsApplier"
    ) as BlockOperationsApplier,
  };
}
