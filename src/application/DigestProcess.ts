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
import { IntegrationRegistry } from "../integrations/IntegrationPlugin";
import { ScheduledJobStore } from "../scheduler/ScheduledJobStore";
import { Scheduler } from "../scheduler/Scheduler";
import { log } from "../utils/mainLogger";
import { isDevelopment } from "../config/development";
import { SchedulerProbePlugin } from "../integrations/development/SchedulerProbePlugin";
import { SqliteCredentialStore } from "../integrations/CredentialStore";
import { ElectronSecretEncryption } from "../integrations/ElectronSecretEncryption";
import { IntegrationAccountStore } from "../integrations/IntegrationAccountStore";
import { BrowserGoogleOAuthAuthorizer } from "../integrations/google-calendar/GoogleOAuthAuthorizer";
import { GoogleCalendarPlugin } from "../integrations/google-calendar/GoogleCalendarPlugin";
import { getEnvVar } from "../config/environment";

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
  private electronBound = false;
  private schedulerInstance: Scheduler | null = null;
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
      if (!this.integrationRegistry.get("google-calendar")) {
        this.integrationRegistry.register(
          new GoogleCalendarPlugin(
            new IntegrationAccountStore(
              initialized.services.database as Database.Database
            ),
            new SqliteCredentialStore(
              initialized.services.database as Database.Database,
              new ElectronSecretEncryption()
            ),
            new BrowserGoogleOAuthAuthorizer(
              getEnvVar("GOOGLE_OAUTH_CLIENT_ID"),
              (url) => shell.openExternal(url)
            )
          )
        );
      }
      if (isDevelopment() && !this.integrationRegistry.get("scheduler-probe")) {
        this.integrationRegistry.register(
          new SchedulerProbePlugin(scheduler, (message) =>
            log.debug(`Probe fired: ${message}`, "Scheduler")
          )
        );
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
    this.applicationServices.dispose();
  }
}
