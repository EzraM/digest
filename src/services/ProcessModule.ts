import {
  Container,
  ResolvedDependencies,
  ServiceDefinition,
  ServiceDependency,
} from "./Container";
import { ContributionRegistry } from "./ContributionRegistry";
import {
  ModuleIPCContext,
  ModuleIPCRegistry,
  ScopedModuleIPC,
} from "./ModuleIPCRegistry";
import { RequestShape } from "./ModuleProtocol";

export interface ServiceReference {
  readonly name: string;
  readonly version?: string;
}

export interface ModuleServiceDefinition<T = unknown>
  extends Omit<ServiceDefinition<T>, "factory"> {
  readonly factory: (
    dependencies: ResolvedDependencies,
    context: { readonly ipc: ScopedModuleIPC }
  ) => T | Promise<T>;
}

export interface ProvidedService<T = unknown> {
  readonly name: string;
  readonly definition: ModuleServiceDefinition<T>;
}

export interface ModuleContribution<T = unknown> {
  readonly point: string;
  readonly id: string;
  readonly dependencies?: readonly ServiceDependency[];
  readonly create: (dependencies: ResolvedDependencies) => T | Promise<T>;
}

export interface ModuleOperation<Input = unknown, Output = unknown> {
  readonly name: string;
  readonly request: RequestShape<Input, Output>;
  readonly dependencies?: readonly ServiceDependency[];
  readonly handle: (
    dependencies: ResolvedDependencies,
    input: Input,
    context: ModuleIPCContext
  ) => Output | Promise<Output>;
}

/** An inert description of the process capabilities supplied by a module. */
export interface ProcessModuleDefinition {
  readonly id: string;
  readonly provides?: readonly ProvidedService[];
  readonly activates?: readonly ServiceReference[];
  readonly contributes?: readonly ModuleContribution[];
  readonly operations?: readonly ModuleOperation<any, any>[];
}

export class ProcessModuleHost {
  readonly contributions = new ContributionRegistry();
  private readonly modules = new Set<string>();
  private readonly roots: ServiceReference[] = [];
  private readonly pendingContributions: ModuleContribution[] = [];

  constructor(
    readonly container: Container,
    readonly moduleIPC: ModuleIPCRegistry = new ModuleIPCRegistry()
  ) {}

  register(module: ProcessModuleDefinition): void {
    if (this.modules.has(module.id)) {
      throw new Error(`Process module already registered: ${module.id}`);
    }
    this.modules.add(module.id);
    const ipc = this.moduleIPC.forModule(module.id);

    for (const service of module.provides ?? []) {
      const { factory, ...definition } = service.definition;
      this.container.register(service.name, {
        ...definition,
        factory: (dependencies) => factory(dependencies, { ipc }),
      });
    }
    this.roots.push(...(module.activates ?? []));
    this.pendingContributions.push(...(module.contributes ?? []));

    for (const operation of module.operations ?? []) {
      ipc.handle(operation.name, operation.request, async (input, context) =>
        operation.handle(
          await this.resolveDependencies(operation.dependencies),
          input,
          context
        )
      );
    }
  }

  async activate(): Promise<void> {
    for (const root of this.roots) {
      await this.container.resolve(root.name, root.version);
    }
    for (const contribution of this.pendingContributions) {
      this.contributions.add(
        contribution.point,
        contribution.id,
        await contribution.create(
          await this.resolveDependencies(contribution.dependencies)
        )
      );
    }
    this.pendingContributions.length = 0;
  }

  clear(): void {
    this.contributions.clear();
    this.moduleIPC.clear();
    this.modules.clear();
    this.roots.length = 0;
    this.pendingContributions.length = 0;
  }

  private async resolveDependencies(
    dependencies: readonly ServiceDependency[] = []
  ): Promise<ResolvedDependencies> {
    const resolved = new Map<string, unknown>();
    for (const dependency of dependencies) {
      const name = typeof dependency === "string" ? dependency : dependency.name;
      const version =
        typeof dependency === "string" ? undefined : dependency.version;
      resolved.set(name, await this.container.resolve(name, version));
    }
    return {
      get: <T>(name: string): T => {
        if (!resolved.has(name)) {
          throw new Error(`Module declaration did not declare dependency: ${name}`);
        }
        return resolved.get(name) as T;
      },
    };
  }
}
