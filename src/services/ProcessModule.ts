import {
  Container,
  ResolvedDependencies,
  ServiceCatalog,
  ServiceReference,
} from "./Container";
import { ContributionRegistry } from "./ContributionRegistry";
import {
  ModuleIPCContext,
  ModuleIPCRegistry,
} from "./ModuleIPCRegistry";
import { RequestShape } from "./ModuleProtocol";

export interface ModuleContribution<T = unknown> {
  readonly point: string;
  readonly id: string;
  readonly dependencies?: readonly ServiceReference[];
  readonly create: (dependencies: ResolvedDependencies) => T | Promise<T>;
}

export interface ModuleOperation<Input = unknown, Output = unknown> {
  readonly name: string;
  readonly request: RequestShape<Input, Output>;
  readonly dependencies?: readonly ServiceReference[];
  readonly handle: (
    dependencies: ResolvedDependencies,
    input: Input,
    context: ModuleIPCContext
  ) => Output | Promise<Output>;
}

/** An inert description of the process capabilities supplied by a module. */
export interface ProcessModuleDefinition extends ServiceCatalog {
  readonly id: string;
  readonly contributes?: readonly ModuleContribution[];
  // Operation input/output types differ within one module and are retained by
  // each declaration; the host only needs their common runtime shape.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    this.container.register({
      ...moduleIPCService(module.id),
      version: "1.0.0",
      create: () => ipc,
    });

    for (const service of module.provides ?? []) {
      this.container.register(service);
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
    dependencies: readonly ServiceReference[] = []
  ): Promise<ResolvedDependencies> {
    const resolved = new Map<string, unknown>();
    for (const dependency of dependencies) {
      resolved.set(
        dependency.name,
        await this.container.resolve(dependency.name, dependency.version)
      );
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

export const moduleIPCService = (moduleId: string): ServiceReference => ({
  name: `digest.module-ipc/${moduleId}`,
  version: "^1.0.0",
});
