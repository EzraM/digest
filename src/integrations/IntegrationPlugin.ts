import { JobHandler } from "../scheduler/Scheduler";

export type IntegrationPermission =
  | { type: "external-account"; provider: string }
  | { type: "background-network-access" }
  | { type: "read-calendar-events" }
  | { type: "open-external-url" };

export interface IntegrationManifest {
  id: string;
  name: string;
  permissions: IntegrationPermission[];
}

export interface ConnectedIntegrationAccount {
  id: string;
  integrationId: string;
  providerAccountId: string;
  displayName: string;
}

export interface IntegrationPlugin {
  manifest: IntegrationManifest;
  jobHandlers: JobHandler[];
  connect(): Promise<ConnectedIntegrationAccount>;
  disconnect(accountId: string): Promise<void>;
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
}
