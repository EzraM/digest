import { Container } from './Container';
import { DatabaseManager } from '../database/DatabaseManager';
import { initializeEventLogger } from './EventLogger';
import { BlockOperationService } from './BlockOperationService';
import { getDebugEventService, DebugEventService } from './DebugEventService';
import { BlockEventManager } from './BlockEventManager';
import { log } from '../utils/mainLogger';

/**
 * Service registry that defines all application services and their dependencies
 * This is where we explicitly declare the dependency graph
 */
export function registerServices(container: Container): void {
  
  // Database - foundational service with no dependencies
  container.register('database', {
    factory: async () => {
      log.debug('Initializing database service', 'ServiceRegistry');
      const dbManager = DatabaseManager.getInstance();
      await dbManager.initialize();
      return dbManager.getDatabase();
    }
  });

  // EventLogger - depends on database
  container.register('eventLogger', {
    dependencies: ['database'],
    factory: async (c) => {
      log.debug('Initializing EventLogger service', 'ServiceRegistry');
      const database = await c.resolve('database');
      return initializeEventLogger(database);
    }
  });

  // BlockOperationService - depends on database (eventLogger resolved lazily)
  container.register('blockOperationService', {
    dependencies: ['database'],
    factory: async (c) => {
      log.debug('Initializing BlockOperationService', 'ServiceRegistry');
      const database = await c.resolve('database');
      const service = BlockOperationService.getInstance();
      service.setDatabase(database);
      return service;
    }
  });


  // DebugEventService - depends on eventLogger being available  
  container.register('debugEventService', {
    dependencies: ['eventLogger'],
    factory: async () => {
      log.debug('Initializing DebugEventService', 'ServiceRegistry');
      // EventLogger is guaranteed to be initialized at this point
      return getDebugEventService();
    }
  });

  // BlockEventManager - depends on eventLogger and blockOperationService
  container.register('blockEventManager', {
    dependencies: ['eventLogger', 'blockOperationService'],
    factory: async () => {
      log.debug('Initializing BlockEventManager', 'ServiceRegistry');
      // EventLogger is guaranteed to be initialized at this point
      return BlockEventManager.getInstance();
    }
  });
}

/**
 * Initialize all core services in dependency order
 * Call this once during app startup
 */
export async function initializeAllServices(container: Container): Promise<void> {
  log.debug('Starting service initialization', 'ServiceRegistry');
  
  // Resolve services sequentially to avoid race conditions
  // (Container handles dependencies automatically)
  await container.resolve('database');
  await container.resolve('eventLogger');
  await container.resolve('blockOperationService');
  await container.resolve('debugEventService');
  await container.resolve('blockEventManager');
  
  log.debug('All services initialized successfully', 'ServiceRegistry');
}

/**
 * Get typed service instances (convenience methods)
 */
export function getServices(container: Container) {
  return {
    database: container.get('database'),
    eventLogger: container.get('eventLogger'),
    blockOperationService: container.get('blockOperationService') as BlockOperationService,
    debugEventService: container.get('debugEventService') as DebugEventService,
    blockEventManager: container.get('blockEventManager') as BlockEventManager
  };
}
