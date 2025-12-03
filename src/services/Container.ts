/**
 * Simple dependency injection container without decorators or reflection
 * Uses explicit dependency declarations and topological sorting
 */

import semver from "semver";

export type ServiceFactory<T = any> = (container: Container) => T | Promise<T>;

export interface ServiceDefinition<T = any> {
  /** Factory function that creates the service instance */
  factory: ServiceFactory<T>;
  /** Array of service names this service depends on */
  dependencies?: string[];
  /** Whether to cache the instance (default: true) */
  singleton?: boolean;
  /** Optional semantic version for the service API */
  version?: string;
}

export class Container {
  private definitions = new Map<string, ServiceDefinition>();
  private instances = new Map<string, any>();
  private initializing = new Set<string>();

  /**
   * Register a service with explicit dependencies
   */
  register<T>(name: string, definition: ServiceDefinition<T>): void {
    if (definition.version && !semver.valid(definition.version)) {
      throw new Error(
        `Invalid version "${definition.version}" for service ${name}`
      );
    }
    this.definitions.set(name, definition);
  }

  /**
   * Resolve a service and all its dependencies
   * Uses topological sorting to ensure dependencies are resolved first
   */
  async resolve<T>(name: string, versionRange?: string): Promise<T> {
    // Prevent circular dependencies
    if (this.initializing.has(name)) {
      const chain = Array.from(this.initializing).join(' -> ');
      throw new Error(`Circular dependency detected: ${chain} -> ${name}`);
    }

    // Return existing singleton instance
    if (this.instances.has(name)) {
      return this.instances.get(name);
    }

    const definition = this.definitions.get(name);
    if (!definition) {
      throw new Error(`Service not registered: ${name}`);
    }

    if (versionRange) {
      if (!definition.version) {
        throw new Error(
          `Service ${name} does not declare a version but version range ${versionRange} was requested`
        );
      }

      if (!semver.satisfies(definition.version, versionRange)) {
        throw new Error(
          `Service ${name} version ${definition.version} does not satisfy requested range ${versionRange}`
        );
      }
    }

    this.initializing.add(name);
    
    try {
      // Resolve all dependencies first (topological sort)
      if (definition.dependencies) {
        for (const dependency of definition.dependencies) {
          await this.resolve(dependency);
        }
      }

      // Create the service instance
      const instance = await definition.factory(this);
      
      // Cache singleton instances (default behavior)
      if (definition.singleton !== false) {
        this.instances.set(name, instance);
      }
      
      return instance;
    } finally {
      this.initializing.delete(name);
    }
  }

  /**
   * Get a service synchronously (must already be resolved)
   */
  get<T>(name: string): T {
    const instance = this.instances.get(name);
    if (!instance) {
      throw new Error(`Service not resolved or not a singleton: ${name}`);
    }
    return instance;
  }

  /**
   * Check if a service is registered
   */
  has(name: string): boolean {
    return this.definitions.has(name);
  }

  /**
   * Clear all instances (for testing)
   */
  clear(): void {
    this.instances.clear();
    this.initializing.clear();
  }

  /**
   * Get dependency graph for debugging
   */
  getDependencyGraph(): Record<string, string[]> {
    const graph: Record<string, string[]> = {};
    for (const [name, def] of this.definitions) {
      graph[name] = def.dependencies || [];
    }
    return graph;
  }
}