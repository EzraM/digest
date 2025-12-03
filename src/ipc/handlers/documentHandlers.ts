import { DocumentManager } from "../../services/DocumentManager";
import { IPCHandlerMap } from "../IPCRouter";
export function createDocumentHandlers(
  documentManager: DocumentManager,
  profileIdResolver: () => string | null,
  broadcastDocumentTree: (profileId: string | null) => void,
  broadcastActiveDocument: () => void,
  loadDocumentIntoRenderer: (
    documentId: string,
    options?: { seedIfEmpty?: boolean }
  ) => Promise<void>
): IPCHandlerMap {
  return {
    "documents:get-active": {
      type: "invoke",
      fn: () => documentManager.activeDocument,
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
        const document = documentManager.getDocument(documentId);
        await documentManager.deleteDocument(documentId);
        broadcastDocumentTree(document.profileId);
        broadcastActiveDocument();
        return { success: true };
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
      fn: async (_event, documentId: string) => {
        const document = documentManager.switchDocument(documentId);

        await loadDocumentIntoRenderer(documentId, { seedIfEmpty: true });
        broadcastDocumentTree(document.profileId);
        broadcastActiveDocument();

        return document;
      },
    },
  };
}
