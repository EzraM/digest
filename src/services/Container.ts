/**
 * Simple dependency injection container without decorators or reflection
 * Uses explicit dependency declarations and topological sorting
 */

import semver from "semver";

export interface ResolvedDependencies {
  get<T>(name: string): T;
}

export interface ServiceReference {
  readonly name: string;
  readonly version?: string;
}

export type ServiceCreator<T = unknown> = (
  dependencies: ResolvedDependencies
) => T | Promise<T>;

/** An inert declaration interpreted by Container. */
export interface ServiceDeclaration<T = unknown> {
  readonly name: string;
  /** Function that creates the service instance */
  readonly create: ServiceCreator<T>;
  /** Service names this service depends on */
  readonly dependencies?: readonly ServiceReference[];
  /** Whether to cache the instance (default: true) */
  readonly singleton?: boolean;
  /** Optional semantic version for the service API */
  readonly version?: string;
  /** Optional process-lifecycle cleanup. */
  dispose?(instance: T): void | Promise<void>;
}

export interface ServiceCatalog {
  readonly provides?: readonly ServiceDeclaration[];
  readonly activates?: readonly ServiceReference[];
}

export async function activateServices(
  container: Container,
  catalog: ServiceCatalog
): Promise<void> {
  for (const service of catalog.provides ?? []) container.register(service);
  for (const root of catalog.activates ?? []) {
    await container.resolve(root.name, root.version);
  }
}

export class Container {
  private definitions = new Map<string, ServiceDeclaration>();
  private instances = new Map<string, unknown>();
  private initializing = new Set<string>();
  private resolutionOrder: string[] = [];

  /**
   * Register a service with explicit dependencies
   */
  register<T>(declaration: ServiceDeclaration<T>): void {
    if (this.definitions.has(declaration.name)) {
      throw new Error(`Service already registered: ${declaration.name}`);
    }
    if (declaration.version && !semver.valid(declaration.version)) {
      throw new Error(
        `Invalid version "${declaration.version}" for service ${declaration.name}`
      );
    }
    this.definitions.set(declaration.name, declaration);
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
      return this.instances.get(name) as T;
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
        dependencies.set(
          dependency.name,
          await this.resolve(dependency.name, dependency.version)
        );
      }

      // Create the service instance
      const instance = await definition.create({
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
      
      return instance as T;
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
    return instance as T;
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
      graph[name] = (def.dependencies ?? []).map(
        (dependency) => dependency.name
      );
    }
    return graph;
  }
}
