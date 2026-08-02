/**
 * Simple dependency injection container without decorators or reflection
 * Uses explicit dependency declarations and topological sorting
 */

import semver from "semver";

export interface ResolvedDependencies {
  get<T>(name: string): T;
}

export type ServiceFactory<T = any> = (
  dependencies: ResolvedDependencies
) => T | Promise<T>;

export type ServiceDependency =
  | string
  | { name: string; version?: string };

export interface ServiceDefinition<T = any> {
  /** Factory function that creates the service instance */
  factory: ServiceFactory<T>;
  /** Service names this service depends on */
  dependencies?: readonly ServiceDependency[];
  /** Whether to cache the instance (default: true) */
  singleton?: boolean;
  /** Optional semantic version for the service API */
  version?: string;
  /** Optional process-lifecycle cleanup. */
  dispose?: (instance: T) => void | Promise<void>;
}

export class Container {
  private definitions = new Map<string, ServiceDefinition>();
  private instances = new Map<string, any>();
  private initializing = new Set<string>();
  private resolutionOrder: string[] = [];

  /**
   * Register a service with explicit dependencies
   */
  register<T>(name: string, definition: ServiceDefinition<T>): void {
    if (this.definitions.has(name)) {
      throw new Error(`Service already registered: ${name}`);
    }
    if (definition.version && !semver.valid(definition.version)) {
      throw new Error(
        `Invalid version "${definition.version}" for service ${name}`
      );
    }
    this.definitions.set(name, definition);
  }

  registerInstance<T>(
    name: string,
    instance: T,
    options: { version?: string; dispose?: (instance: T) => void | Promise<void> } = {}
  ): void {
    this.register(name, {
      version: options.version,
      factory: () => instance,
      dispose: options.dispose,
    });
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
      const dependencies = new Map<string, unknown>();
      for (const dependency of definition.dependencies ?? []) {
        const name = typeof dependency === "string" ? dependency : dependency.name;
        const version = typeof dependency === "string" ? undefined : dependency.version;
        dependencies.set(name, await this.resolve(name, version));
      }

      // Create the service instance
      const instance = await definition.factory({
        get: <Dependency>(dependencyName: string): Dependency => {
          if (!dependencies.has(dependencyName)) {
            throw new Error(
              `Service ${name} did not declare dependency: ${dependencyName}`
            );
          }
          return dependencies.get(dependencyName) as Dependency;
        },
      });
      
      // Cache singleton instances (default behavior)
      if (definition.singleton !== false) {
        this.instances.set(name, instance);
        this.resolutionOrder.push(name);
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
    if (!this.instances.has(name)) {
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
    this.resolutionOrder = [];
  }

  async dispose(): Promise<void> {
    for (const name of [...this.resolutionOrder].reverse()) {
      const definition = this.definitions.get(name);
      if (definition?.dispose) {
        await definition.dispose(this.instances.get(name));
      }
    }
    this.clear();
  }

  /**
   * Get dependency graph for debugging
   */
  getDependencyGraph(): Record<string, string[]> {
    const graph: Record<string, string[]> = {};
    for (const [name, def] of this.definitions) {
      graph[name] = (def.dependencies ?? []).map((dependency) =>
        typeof dependency === "string" ? dependency : dependency.name
      );
    }
    return graph;
  }
}
