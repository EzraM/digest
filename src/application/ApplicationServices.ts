import Database from "better-sqlite3";
import { blockNoteEditor } from "../domains/notebook-content/application/BlockNoteRuntime";
import { Container } from "../services/Container";
import {
  getServices,
  initializeAllServices,
  registerServices,
} from "../services/ServiceRegistry";
import { log } from "../utils/mainLogger";
import { CanonicalDerivedDataCoordinator } from "./CanonicalDerivedDataCoordinator";
import { CollaborationDocumentService } from "./CollaborationDocumentService";

export interface InitializedApplicationServices {
  services: ReturnType<typeof getServices>;
  collaborationDocuments: CollaborationDocumentService;
}

export interface ApplicationServices {
  container: Container;
  initialize(): Promise<InitializedApplicationServices>;
  dispose(): void;
}

export const createApplicationServices = (): ApplicationServices => {
  const container = new Container();
  let initialization: Promise<InitializedApplicationServices> | undefined;
  let derivedDataCoordinator: CanonicalDerivedDataCoordinator | undefined;

  const initialize = () => {
    if (initialization) return initialization;

    initialization = (async () => {
      registerServices(container);
      await initializeAllServices(container);
      const services = getServices(container);
      const collaborationDocuments = new CollaborationDocumentService(
        services.database as Database.Database,
        blockNoteEditor.pmSchema
      );
      derivedDataCoordinator = new CanonicalDerivedDataCoordinator({
        reindexDocument: (documentId, blocks) =>
          services.searchIndexManager.reindexDocument(documentId, blocks),
        releaseAsset: (assetId) => services.assetService.release(assetId),
        onError: (documentId, error) =>
          log.debug(
            `Canonical derived-data update failed for ${documentId}: ${error}`,
            "main"
          ),
      });
      collaborationDocuments.subscribeCanonicalChanges((snapshot) =>
        derivedDataCoordinator?.schedule(snapshot)
      );
      for (const document of services.documentManager.listDocuments()) {
        derivedDataCoordinator.seed(
          collaborationDocuments.readCanonicalDocument(document.id)
        );
      }
      log.debug("Application services initialized", "main");
      return { services, collaborationDocuments };
    })();

    return initialization;
  };

  return {
    container,
    initialize,
    dispose: () => derivedDataCoordinator?.dispose(),
  };
};
