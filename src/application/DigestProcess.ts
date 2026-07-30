import { session } from "electron";
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
  private electronBound = false;

  initialize() {
    return this.applicationServices.initialize();
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
    this.electronBound = true;
    return initialized;
  }

  dispose() {
    this.applicationServices.dispose();
  }
}
