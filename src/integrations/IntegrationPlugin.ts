import { JobHandler } from "../scheduler/Scheduler";

export interface IntegrationManifest {
  id: string;
  name: string;
  summary: string;
  connectionDescription: string;
}

export interface ConnectedIntegrationAccount {
  id: string;
  integrationId: string;
  providerAccountId: string;
  displayName: string;
  email?: string;
}

export interface IntegrationPlugin {
  manifest: IntegrationManifest;
  jobHandlers: JobHandler[];
  listAccounts?(): ConnectedIntegrationAccount[];
  start?(): void | Promise<void>;
  stop?(): void | Promise<void>;
  connect?(): Promise<ConnectedIntegrationAccount>;
  cancelConnect?(): void;
  disconnect?(accountId: string): Promise<void>;
}

export class IntegrationRegistry {
  private readonly plugins = new Map<string, IntegrationPlugin>();

  register(plugin: IntegrationPlugin): void {
    if (this.plugins.has(plugin.manifest.id)) {
      throw new Error(`Integration already registered: ${plugin.manifest.id}`);
    }
    this.plugins.set(plugin.manifest.id, plugin);
  }

  get(id: string): IntegrationPlugin | undefined {
    return this.plugins.get(id);
  }

  list(): IntegrationManifest[] {
    return [...this.plugins.values()].map((plugin) => plugin.manifest);
  }

  jobHandlers(): JobHandler[] {
    return [...this.plugins.values()].flatMap((plugin) => plugin.jobHandlers);
  }

  async start(): Promise<void> {
    for (const plugin of this.plugins.values()) await plugin.start?.();
  }

  async stop(): Promise<void> {
    for (const plugin of [...this.plugins.values()].reverse()) {
      await plugin.stop?.();
    }
  }

  connectedAccounts(): ConnectedIntegrationAccount[] {
    return [...this.plugins.values()].flatMap(
      (plugin) => plugin.listAccounts?.() ?? []
    );
  }

  async connect(id: string): Promise<ConnectedIntegrationAccount> {
    const plugin = this.plugins.get(id);
    if (!plugin?.connect) throw new Error(`Integration cannot connect: ${id}`);
    return plugin.connect();
  }

  async disconnect(id: string, accountId: string): Promise<void> {
    const plugin = this.plugins.get(id);
    if (!plugin?.disconnect) throw new Error(`Integration cannot disconnect: ${id}`);
    await plugin.disconnect(accountId);
  }

  cancelConnect(id: string): void {
    const plugin = this.plugins.get(id);
    if (!plugin?.cancelConnect) throw new Error(`Integration cannot cancel connection: ${id}`);
    plugin.cancelConnect();
  }
}
