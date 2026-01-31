import { Container } from "./Container";
import { DatabaseManager } from "../database/DatabaseManager";
import { initializeEventLogger } from "./EventLogger";
import { BlockOperationService } from "../domains/blocks/services";
import { getDebugEventService, DebugEventService } from "./DebugEventService";
import { BlockEventManager } from "../domains/blocks/services";
import { log } from "../utils/mainLogger";
import { ProfileManager } from "./ProfileManager";
import { DocumentManager } from "./DocumentManager";
import { ImageService } from "./ImageService";

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
  };
}
