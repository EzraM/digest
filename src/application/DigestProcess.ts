import { powerMonitor, session, shell } from "electron";
import type Database from "better-sqlite3";
import { registerAssetProtocol } from "../domains/assets/adapter/registerAssetProtocol";
import { HandleRegistry } from "../domains/browser-views/adapter/HandleRegistry";
import { IPCRouter } from "../ipc/IPCRouter";
import { registerIpcHandlers } from "../ipc/registerIpcHandlers";
import { ApplicationJourneyAllocator } from "../services/ApplicationJourneyAllocator";
import { BrowsingJourneyStore } from "../services/BrowsingJourneyStore";
import { DownloadManager } from "../services/DownloadManager";
import { IPCServiceBridge } from "../services/IPCServiceBridge";
import { WindowPresentationStore } from "../services/WindowPresentationStore";
import { createApplicationServices } from "./ApplicationServices";
import { PlacementRegistry } from "./PlacementRegistry";
import { WindowRegistry } from "./WindowRegistry";
import {
  IntegrationPlugin,
  IntegrationRegistry,
} from "../integrations/IntegrationPlugin";
import { createBuiltInModules } from "../integrations/builtInModules";
import { ScheduledJobStore } from "../scheduler/ScheduledJobStore";
import { Scheduler } from "../scheduler/Scheduler";
import { isDevelopment } from "../config/development";
import { CONTRIBUTION_POINTS } from "../services/contributionPoints";
import { ModuleEventEnvelope, ModuleIPCRegistry } from "../services/ModuleIPCRegistry";
import { ProcessModuleHost } from "../services/ProcessModule";
import { SERVICE_IDS } from "../services/serviceIds";

export type OpenWindow = (
  initialHash?: string,
  initialDocumentId?: string | null
) => Promise<void>;

/** Owns resources whose lifetime is the Electron process. */
export class DigestProcess {
  readonly applicationServices = createApplicationServices();
  readonly windowRegistry = new WindowRegistry();
  readonly placementRegistry = new PlacementRegistry();
  readonly viewStoreByRendererId = new Map<number, WindowPresentationStore>();
  readonly placementIdByRendererId = new Map<number, string>();
  readonly journeyAllocator = new ApplicationJourneyAllocator({
    journeys: new BrowsingJourneyStore(10),
    handles: new HandleRegistry(),
  });
  readonly ipcRouter = new IPCRouter();
  readonly integrationRegistry = new IntegrationRegistry();
  readonly moduleIPC = new ModuleIPCRegistry();
  readonly moduleHost = new ProcessModuleHost(
    this.applicationServices.container,
    this.moduleIPC
  );
  private electronBound = false;
  private modulesRegistered = false;
  private schedulerInstance: Scheduler | null = null;
  private unpublishModuleEvents: (() => void) | null = null;
  private readonly wakeScheduler = () => this.schedulerInstance?.wake();

  get scheduler(): Scheduler {
    if (!this.schedulerInstance) {
      throw new Error("DigestProcess has not been initialized");
    }
    return this.schedulerInstance;
  }

  async initialize() {
    const initialized = await this.applicationServices.initialize();
    if (!this.schedulerInstance) {
      const store = new ScheduledJobStore(
        initialized.services.database as Database.Database
      );
      const scheduler = new Scheduler(store);
      const container = this.applicationServices.container;
      if (!container.has(SERVICE_IDS.SCHEDULER)) {
        container.registerInstance(SERVICE_IDS.SCHEDULER, scheduler, {
          version: "1.0.0",
        });
        await container.resolve(SERVICE_IDS.SCHEDULER);
      }
      if (!this.modulesRegistered) {
        for (const module of createBuiltInModules(
          (url) => shell.openExternal(url),
          isDevelopment()
        )) {
          this.moduleHost.register(module);
        }
        this.modulesRegistered = true;
        await this.moduleHost.activate();
        for (const plugin of this.moduleHost.contributions.list<IntegrationPlugin>(
          CONTRIBUTION_POINTS.INTEGRATION
        )) {
          this.integrationRegistry.register(plugin);
        }
      }
      for (const handler of this.integrationRegistry.jobHandlers()) {
        scheduler.register(handler);
      }
      scheduler.start();
      this.schedulerInstance = scheduler;
      await this.integrationRegistry.start();
    }
    return initialized;
  }

  async bindElectron(downloadManager: DownloadManager, openWindow: OpenWindow) {
    const initialized = await this.initialize();
    if (this.electronBound) return initialized;

    const bridge = new IPCServiceBridge(
      this.ipcRouter,
      this.applicationServices.container
    );
    bridge.exposeService(
      "profileManager",
      [{ method: "listProfiles", alias: "list" }],
      "profiles"
    );
    bridge.exposeService(
      "assetService",
      [
        { method: "save", alias: "save" },
        { method: "info", alias: "info" },
        { method: "importUrl", alias: "importUrl" },
        { method: "release", alias: "release" },
        { method: "attach", alias: "attach" },
      ],
      "asset"
    );
    const rendererSession = session.fromPartition("persist:main-app");
    registerAssetProtocol(
      rendererSession.protocol,
      initialized.services.assetService.store
    );
    registerIpcHandlers({
      router: this.ipcRouter,
      services: initialized.services,
      downloadManager,
      collaborationDocuments: initialized.collaborationDocuments,
      journeyAllocator: this.journeyAllocator,
      placementRegistry: this.placementRegistry,
      windowRegistry: this.windowRegistry,
      viewStoreByRendererId: this.viewStoreByRendererId,
      placementIdByRendererId: this.placementIdByRendererId,
      openWindow,
    });
    this.ipcRouter.register("integrations:list", {
      type: "invoke",
      fn: () => ({
        integrations: this.integrationRegistry.list(),
        accounts: this.integrationRegistry.connectedAccounts(),
      }),
    });
    this.ipcRouter.register("integrations:connect", {
      type: "invoke",
      fn: (_event, integrationId: string) =>
        this.integrationRegistry.connect(integrationId),
    });
    this.ipcRouter.register("integrations:disconnect", {
      type: "invoke",
      fn: (_event, integrationId: string, accountId: string) =>
        this.integrationRegistry.disconnect(integrationId, accountId),
    });
    this.ipcRouter.register("modules:invoke", {
      type: "invoke",
      fn: (event, moduleId: string, method: string, input: unknown) =>
        this.moduleIPC.invoke(moduleId, method, input, {
          rendererId: event.sender.id,
        }),
    });
    this.unpublishModuleEvents = this.moduleIPC.setPublisher((event) =>
      this.publishModuleEvent(event)
    );
    powerMonitor.on("resume", this.wakeScheduler);
    powerMonitor.on("unlock-screen", this.wakeScheduler);
    this.electronBound = true;
    return initialized;
  }

  dispose() {
    if (this.electronBound) {
      powerMonitor.removeListener("resume", this.wakeScheduler);
      powerMonitor.removeListener("unlock-screen", this.wakeScheduler);
      this.electronBound = false;
    }
    this.integrationRegistry.stop();
    this.schedulerInstance?.stop();
    this.schedulerInstance = null;
    this.unpublishModuleEvents?.();
    this.unpublishModuleEvents = null;
    this.moduleHost.clear();
    this.applicationServices.dispose();
  }

  private publishModuleEvent(event: ModuleEventEnvelope): void {
    for (const window of this.windowRegistry.list()) {
      if (!window.rendererView.webContents.isDestroyed()) {
        window.rendererView.webContents.send("modules:event", event);
      }
    }
  }
}
