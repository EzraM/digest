import Database from "better-sqlite3";
import { CollaborationDocumentService } from "../application/CollaborationDocumentService";
import { PlacementRegistry } from "../application/PlacementRegistry";
import { WindowRegistry } from "../application/WindowRegistry";
import { ApplicationJourneyAllocator } from "../services/ApplicationJourneyAllocator";
import { BrowserPresentationCoordinator } from "../services/BrowserPresentationCoordinator";
import { DownloadManager } from "../services/DownloadManager";
import { LivePageCacheTelemetry } from "../services/LivePageCacheTelemetry";
import { getServices } from "../services/ServiceRegistry";
import { WindowPresentationStore } from "../services/WindowPresentationStore";
import { createBrowserHandlers } from "./handlers/browserHandlers";
import { createCollaborationHandlers } from "./handlers/collaborationHandlers";
import { createDocumentHandlers } from "./handlers/documentHandlers";
import { createDownloadHandlers } from "./handlers/downloadHandlers";
import { createProfileHandlers } from "./handlers/profileHandlers";
import { createRendererHandlers } from "./handlers/rendererHandlers";
import { createSearchHandlers } from "./handlers/searchHandlers";
import { createWindowHandlers } from "./handlers/windowHandlers";
import { IPCHandlerMap, IPCRouter } from "./IPCRouter";

type Services = ReturnType<typeof getServices>;

interface RegisterIpcHandlersOptions {
  router: IPCRouter;
  services: Services;
  downloadManager: DownloadManager;
  collaborationDocuments: CollaborationDocumentService;
  journeyAllocator: ApplicationJourneyAllocator;
  placementRegistry: PlacementRegistry;
  windowRegistry: WindowRegistry;
  viewStoreByRendererId: Map<number, WindowPresentationStore>;
  placementIdByRendererId: Map<number, string>;
  openWindow: (
    initialHash?: string,
    initialDocumentId?: string | null
  ) => Promise<void>;
}

export const registerIpcHandlers = ({
  router,
  services,
  downloadManager,
  collaborationDocuments,
  journeyAllocator,
  placementRegistry,
  windowRegistry,
  viewStoreByRendererId,
  placementIdByRendererId,
  openWindow,
}: RegisterIpcHandlersOptions) => {
  const { documentManager, profileManager } = services;
  const presentationCoordinator = new BrowserPresentationCoordinator(
    journeyAllocator,
    (placementId) => {
      const placement = placementRegistry.get(placementId);
      if (!placement || placement.state !== "active") {
        throw new Error(`Unknown or retired placement: ${placementId}`);
      }
      const store = viewStoreByRendererId.get(placement.ownerRendererId);
      if (!store) {
        throw new Error(`No presentation store for placement: ${placementId}`);
      }
      return store;
    },
    new LivePageCacheTelemetry(services.database as Database.Database)
  );

  const sendToRenderer = (
    channel: string,
    payload: unknown,
    rendererId?: number
  ) => {
    const targets = rendererId
      ? windowRegistry
          .list()
          .filter((session) => session.rendererView.webContents.id === rendererId)
      : windowRegistry.list();
    for (const target of targets) {
      if (!target.rendererView.webContents.isDestroyed()) {
        target.rendererView.webContents.send(channel, payload);
      }
    }
  };

  collaborationDocuments.setPublisher((event) => {
    for (const rendererId of collaborationDocuments.subscribers(
      event.documentId
    )) {
      if (
        rendererId === event.producerRendererId &&
        !event.includeProducer
      ) {
        continue;
      }
      sendToRenderer("documents:collaboration-update", event, rendererId);
    }
  });

  const broadcastDocumentTree = (
    profileId: string | null,
    rendererId?: number
  ) => {
    if (!profileId) return;
    const tree = documentManager.getDocumentTree(profileId);
    sendToRenderer("document-tree:updated", { profileId, tree }, rendererId);
  };

  const broadcastProfiles = (rendererId?: number) => {
    const profiles = profileManager.listProfiles();
    sendToRenderer("profiles:updated", { profiles }, rendererId);
  };

  const broadcastActiveDocument = (rendererId?: number) => {
    const targets = rendererId
      ? windowRegistry
          .list()
          .filter(
            (session) => session.rendererView.webContents.id === rendererId
          )
      : windowRegistry.list();
    for (const target of targets) {
      const document = target.selectedDocumentId
        ? documentManager.getDocument(target.selectedDocumentId)
        : documentManager.activeDocument;
      if (!target.rendererView.webContents.isDestroyed()) {
        target.rendererView.webContents.send("document:switched", {
          document,
        });
      }
    }
  };

  const resolveProfileId = () => profileManager.listProfiles()[0]?.id ?? null;

  const registerMap = (handlers: IPCHandlerMap) => {
    Object.entries(handlers).forEach(([channel, handler]) =>
      router.register(channel, handler)
    );
  };

  registerMap(createWindowHandlers(windowRegistry, openWindow));
  registerMap(createRendererHandlers());
  registerMap(
    createBrowserHandlers(
      (event) => {
        const store = viewStoreByRendererId.get(event.sender.id);
        if (!store) {
          throw new Error(`Unknown Digest renderer: ${event.sender.id}`);
        }
        return store;
      },
      (event, rendererPlacementId) => {
        const placementId = placementIdByRendererId.get(event.sender.id);
        if (!placementId) {
          throw new Error(`No active placement for renderer: ${event.sender.id}`);
        }
        if (rendererPlacementId && rendererPlacementId !== placementId) {
          throw new Error(
            `Renderer ${event.sender.id} does not own placement ${rendererPlacementId}`
          );
        }
        placementRegistry.requireOwnedActive(placementId, event.sender.id);
        return placementId;
      },
      presentationCoordinator
    )
  );
  registerMap(
    createCollaborationHandlers(
      collaborationDocuments,
      documentManager,
      windowRegistry
    )
  );
  registerMap(
    createProfileHandlers(
      profileManager,
      broadcastProfiles,
      broadcastDocumentTree
    )
  );
  registerMap(
    createDocumentHandlers(
      documentManager,
      windowRegistry,
      resolveProfileId,
      broadcastDocumentTree,
      broadcastActiveDocument,
      (documentId) =>
        services.searchIndexManager.reindexDocument(documentId, [])
    )
  );
  registerMap(
    createSearchHandlers(
      services.searchIndexManager,
      services.braveSearchService
    )
  );
  registerMap(createDownloadHandlers(downloadManager));
};
