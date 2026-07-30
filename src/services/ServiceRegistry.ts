import { Container } from "./Container";
import { CORE_SERVICE_BOOT_ORDER, SERVICE_IDS } from "./serviceIds";
import { DatabaseManager } from "../database/DatabaseManager";
import { initializeEventLogger } from "./EventLogger";
import { getDebugEventService, DebugEventService } from "./DebugEventService";
import { log } from "../utils/mainLogger";
import { ProfileManager } from "./ProfileManager";
import { DocumentManager } from "./DocumentManager";
import { AssetService } from "../domains/assets/application/AssetService";
import { SqliteAssetStore } from "../domains/assets/adapter/SqliteAssetStore";
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

  container.register(SERVICE_IDS.ASSET_SERVICE, {
    version: "1.0.0",
    dependencies: [SERVICE_IDS.DATABASE],
    factory: async (c) => {
      log.debug("Initializing asset capability", "ServiceRegistry");
      const database = await c.resolve<Database.Database>(
        SERVICE_IDS.DATABASE
      );
      return new AssetService(new SqliteAssetStore(database));
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
    debugEventService: container.get(SERVICE_IDS.DEBUG_EVENT_SERVICE) as DebugEventService,
    profileManager: container.get(SERVICE_IDS.PROFILE_MANAGER) as ProfileManager,
    documentManager: container.get(SERVICE_IDS.DOCUMENT_MANAGER) as DocumentManager,
    assetService: container.get(SERVICE_IDS.ASSET_SERVICE) as AssetService,
    searchIndexManager: container.get(
      SERVICE_IDS.SEARCH_INDEX_MANAGER
    ) as SearchIndexManager,
    braveSearchService: container.get(
      SERVICE_IDS.BRAVE_SEARCH_SERVICE
    ) as BraveSearchService,
  };
}
