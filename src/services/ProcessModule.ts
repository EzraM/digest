import {
  Container,
  ServiceDefinition,
} from "./Container";
import {
  ContributionRegistry,
  Disposable,
} from "./ContributionRegistry";
import { ModuleIPCRegistry, ScopedModuleIPC } from "./ModuleIPCRegistry";

export interface ProcessModule {
  readonly id: string;
  register(registrar: ProcessModuleRegistrar): void;
}

export interface ProcessModuleRegistrar {
  readonly ipc: ScopedModuleIPC;
  provide<T>(name: string, definition: ServiceDefinition<T>): void;
  activate(name: string, versionRange?: string): void;
  contribute<T>(point: string, id: string, contribution: T): Disposable;
}

export class ProcessModuleHost {
  readonly contributions = new ContributionRegistry();
  private readonly modules = new Set<string>();
  private readonly roots: Array<{ name: string; versionRange?: string }> = [];

  constructor(
    readonly container: Container,
    readonly moduleIPC: ModuleIPCRegistry = new ModuleIPCRegistry()
  ) {}

  register(module: ProcessModule): void {
    if (this.modules.has(module.id)) {
      throw new Error(`Process module already registered: ${module.id}`);
    }
    this.modules.add(module.id);
    module.register({
      ipc: this.moduleIPC.forModule(module.id),
      provide: (name, definition) => this.container.register(name, definition),
      activate: (name, versionRange) =>
        this.roots.push({ name, versionRange }),
      contribute: (point, id, contribution) =>
        this.contributions.add(point, id, contribution),
    });
  }

  async activate(): Promise<void> {
    for (const root of this.roots) {
      await this.container.resolve(root.name, root.versionRange);
    }
  }

  clear(): void {
    this.contributions.clear();
    this.moduleIPC.clear();
    this.modules.clear();
    this.roots.length = 0;
  }
}
