import { randomUUID } from "crypto";
import { CollaborationDocumentService } from "../../application/CollaborationDocumentService";
import { WindowRegistry } from "../../application/WindowRegistry";
import { DocumentManager } from "../../services/DocumentManager";
import { IPCHandlerMap } from "../IPCRouter";

const asUint8Array = (value: unknown, field: string): Uint8Array => {
  if (value instanceof Uint8Array) return value;
  if (Array.isArray(value)) return Uint8Array.from(value);
  throw new Error(`${field} must be a Uint8Array`);
};

export function createCollaborationHandlers(
  collaboration: CollaborationDocumentService,
  documents: DocumentManager,
  windows: WindowRegistry
): IPCHandlerMap {
  return {
    "documents:collaboration-subscribe": {
      type: "invoke",
      fn: async (
        event,
        payload: { documentId?: unknown; stateVector?: unknown }
      ) => {
        if (!payload || typeof payload.documentId !== "string") {
          throw new Error("A documentId is required");
        }
        const session = windows.resolve(event.sender);
        if (!session) throw new Error("Unknown Digest renderer");
        const document = documents.getDocument(payload.documentId);
        const subscription = collaboration.subscribe(
          document.id,
          event.sender.id,
          asUint8Array(payload.stateVector, "stateVector")
        );
        session.selectedDocumentId = document.id;
        return {
          document,
          update: subscription.update,
        };
      },
    },
    "documents:collaboration-update": {
      type: "invoke",
      fn: async (
        event,
        payload: {
          documentId?: unknown;
          updateId?: unknown;
          update?: unknown;
        }
      ) => {
        if (!payload || typeof payload.documentId !== "string") {
          throw new Error("A documentId is required");
        }
        const session = windows.resolve(event.sender);
        if (!session || session.selectedDocumentId !== payload.documentId) {
          throw new Error("Renderer is not presenting this document");
        }
        documents.getDocument(payload.documentId);
        return collaboration.applyUpdate({
          documentId: payload.documentId,
          updateId:
            typeof payload.updateId === "string"
              ? payload.updateId
              : randomUUID(),
          update: asUint8Array(payload.update, "update"),
          producerRendererId: event.sender.id,
        });
      },
    },
    "documents:collaboration-unsubscribe": {
      type: "invoke",
      fn: (event, documentId: unknown) => {
        const session = windows.resolve(event.sender);
        if (!session) throw new Error("Unknown Digest renderer");
        if (
          typeof documentId === "string" &&
          session.selectedDocumentId !== documentId
        ) {
          return { unsubscribed: false };
        }
        collaboration.unsubscribe(event.sender.id);
        session.selectedDocumentId = null;
        return { unsubscribed: true };
      },
    },
  };
}
