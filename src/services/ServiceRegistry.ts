import type Database from "better-sqlite3";
import { DatabaseManager } from "../database/DatabaseManager";
import { AssetService } from "../domains/assets/application/AssetService";
import { SqliteAssetStore } from "../domains/assets/adapter/SqliteAssetStore";
import { BraveSearchService } from "../domains/search/services/BraveSearchService";
import { SearchIndexManager } from "../domains/search/services/SearchIndexManager";
import { log } from "../utils/mainLogger";
import { Container, ServiceCatalog } from "./Container";
import { DebugEventService, getDebugEventService } from "./DebugEventService";
import { DocumentManager } from "./DocumentManager";
import { initializeEventLogger } from "./EventLogger";
import { ProfileManager } from "./ProfileManager";
import { SERVICE_IDS } from "./serviceIds";

/** The core process services and the roots Digest starts eagerly. */
export const coreServices = {
  provides: [
    {
      name: SERVICE_IDS.DATABASE,
      version: "1.0.0",
      create: async () => {
        log.debug("Initializing database service", "ServiceRegistry");
        const manager = DatabaseManager.getInstance();
        await manager.initialize();
        return manager.getDatabase();
      },
    },
    {
      name: SERVICE_IDS.EVENT_LOGGER,
      version: "1.0.0",
      dependencies: [{ name: SERVICE_IDS.DATABASE }],
      create: async (dependencies) => {
        log.debug("Initializing EventLogger service", "ServiceRegistry");
        return initializeEventLogger(
          dependencies.get<Database.Database>(SERVICE_IDS.DATABASE)
        );
      },
    },
    {
      name: SERVICE_IDS.PROFILE_MANAGER,
      version: "1.0.0",
      dependencies: [{ name: SERVICE_IDS.DATABASE }],
      create: async (dependencies) => {
        log.debug("Initializing ProfileManager service", "ServiceRegistry");
        return new ProfileManager(
          dependencies.get<Database.Database>(SERVICE_IDS.DATABASE)
        );
      },
    },
    {
      name: SERVICE_IDS.DOCUMENT_MANAGER,
      version: "1.0.0",
      dependencies: [
        { name: SERVICE_IDS.DATABASE },
        { name: SERVICE_IDS.PROFILE_MANAGER },
      ],
      create: async (dependencies) => {
        log.debug("Initializing DocumentManager service", "ServiceRegistry");
        return new DocumentManager(
          dependencies.get<Database.Database>(SERVICE_IDS.DATABASE),
          dependencies.get<ProfileManager>(SERVICE_IDS.PROFILE_MANAGER)
        );
      },
    },
    {
      name: SERVICE_IDS.DEBUG_EVENT_SERVICE,
      version: "1.0.0",
      dependencies: [{ name: SERVICE_IDS.EVENT_LOGGER }],
      create: async () => {
        log.debug("Initializing DebugEventService", "ServiceRegistry");
        return getDebugEventService();
      },
    },
    {
      name: SERVICE_IDS.ASSET_SERVICE,
      version: "1.0.0",
      dependencies: [{ name: SERVICE_IDS.DATABASE }],
      create: async (dependencies) => {
        log.debug("Initializing asset capability", "ServiceRegistry");
        return new AssetService(
          new SqliteAssetStore(
            dependencies.get<Database.Database>(SERVICE_IDS.DATABASE)
          )
        );
      },
    },
    {
      name: SERVICE_IDS.SEARCH_INDEX_MANAGER,
      version: "1.0.0",
      dependencies: [{ name: SERVICE_IDS.DATABASE }],
      create: async (dependencies) => {
        log.debug("Initializing SearchIndexManager", "ServiceRegistry");
        return SearchIndexManager.initialize(
          dependencies.get<Database.Database>(SERVICE_IDS.DATABASE),
          { searchProvider: "fts5" }
        );
      },
    },
    {
      name: SERVICE_IDS.BRAVE_SEARCH_SERVICE,
      version: "1.0.0",
      create: async () => {
        log.debug("Initializing BraveSearchService", "ServiceRegistry");
        return new BraveSearchService();
      },
    },
  ],
  activates: [
    { name: SERVICE_IDS.DATABASE },
    { name: SERVICE_IDS.EVENT_LOGGER },
    { name: SERVICE_IDS.PROFILE_MANAGER },
    { name: SERVICE_IDS.DOCUMENT_MANAGER },
    { name: SERVICE_IDS.DEBUG_EVENT_SERVICE },
    { name: SERVICE_IDS.ASSET_SERVICE },
    { name: SERVICE_IDS.SEARCH_INDEX_MANAGER },
    { name: SERVICE_IDS.BRAVE_SEARCH_SERVICE },
  ],
} satisfies ServiceCatalog;

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
