import { DocumentManager } from "../../services/DocumentManager";
import { IPCHandlerMap } from "../IPCRouter";
import { WindowRegistry } from "../../application/WindowRegistry";
export function createDocumentHandlers(
  documentManager: DocumentManager,
  windowRegistry: WindowRegistry,
  profileIdResolver: () => string | null,
  broadcastDocumentTree: (profileId: string | null) => void,
  broadcastActiveDocument: (rendererId?: number) => void,
  clearDocumentSearchIndex: (documentId: string) => Promise<void>
): IPCHandlerMap {
  return {
    "documents:get-active": {
      type: "invoke",
      fn: (event) => {
        const selectedDocumentId =
          windowRegistry.resolve(event.sender)?.selectedDocumentId;
        return selectedDocumentId
          ? documentManager.getDocument(selectedDocumentId)
          : documentManager.activeDocument;
      },
    },
    "documents:get-tree": {
      type: "invoke",
      fn: (_event, profileId?: string | null) => {
        const resolvedProfileId =
          profileId ??
          documentManager.activeDocument?.profileId ??
          profileIdResolver();

        if (!resolvedProfileId) return [];
        return documentManager.getDocumentTree(resolvedProfileId);
      },
    },
    "documents:create": {
      type: "invoke",
      fn: (
        _event,
        payload: {
          profileId: string;
          title?: string | null;
          parentDocumentId?: string | null;
          position?: number;
        }
      ) => {
        const document = documentManager.createDocument(
          payload.profileId,
          payload.title,
          {
            parentDocumentId: payload.parentDocumentId ?? null,
            position: payload.position,
          }
        );

        broadcastDocumentTree(payload.profileId);
        return document;
      },
    },
    "documents:rename": {
      type: "invoke",
      fn: (_event, payload: { documentId: string; title: string }) => {
        const updated = documentManager.renameDocument(
          payload.documentId,
          payload.title
        );
        broadcastDocumentTree(updated.profileId);
        broadcastActiveDocument();
        return updated;
      },
    },
    "documents:delete": {
      type: "invoke",
      fn: async (_event, documentId: string) => {
        const result = await documentManager.deleteDocument(documentId);
        await clearDocumentSearchIndex(documentId);
        broadcastDocumentTree(result.profileId);
        broadcastActiveDocument();
        return result;
      },
    },
    "documents:move": {
      type: "invoke",
      fn: (
        _event,
        payload: { documentId: string; newParentId: string | null; position: number }
      ) => {
        const updated = documentManager.moveDocument(
          payload.documentId,
          payload.newParentId,
          payload.position
        );
        broadcastDocumentTree(updated.profileId);
        return updated;
      },
    },
    "documents:move-to-profile": {
      type: "invoke",
      fn: (
        _event,
        payload: { documentId: string; newProfileId: string }
      ) => {
        const current = documentManager.getDocument(payload.documentId);
        const updated = documentManager.moveDocumentToProfile(
          payload.documentId,
          payload.newProfileId
        );
        broadcastDocumentTree(current.profileId);
        broadcastDocumentTree(updated.profileId);
        broadcastActiveDocument();
        return updated;
      },
    },
    "documents:switch": {
      type: "invoke",
      fn: async (event, documentId: string) => {
        const session = windowRegistry.resolve(event.sender);
        if (!session) throw new Error("Unknown Digest renderer");
        const document = documentManager.getDocument(documentId);
        session.selectedDocumentId = documentId;

        broadcastDocumentTree(document.profileId);
        broadcastActiveDocument(event.sender.id);

        return document;
      },
    },
  };
}
