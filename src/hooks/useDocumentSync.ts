import { useEffect } from "react";
import * as Y from "yjs";
import { CustomBlockNoteEditor } from "../types/schema";
import { log } from "../utils/rendererLogger";

const REMOTE_ORIGIN = { kind: "digest-main" };

/**
 * Connects one renderer-local Y.Doc to the main-process canonical Y.Doc.
 * BlockNote is bound directly to this same local document by useRendererEditor.
 */
export const useDocumentSync = (
  editor: CustomBlockNoteEditor,
  documentId: string | null,
  yDoc: Y.Doc
) => {
  useEffect(() => {
    if (!editor || !documentId || !window.electronAPI?.collaboration) return;

    let disposed = false;
    let subscribed = false;
    let applyingBootstrap = true;
    const pending = new Set<Promise<unknown>>();

    const sendUpdate = (update: Uint8Array, origin: unknown) => {
      if (
        disposed ||
        !subscribed ||
        applyingBootstrap ||
        origin === REMOTE_ORIGIN
      ) {
        return;
      }

      const updateId = crypto.randomUUID();
      const request = window.electronAPI.collaboration
        .applyUpdate(documentId, updateId, update)
        .catch((error) => {
          log.debug(
            `Collaborative update ${updateId} was rejected: ${error}`,
            "useDocumentSync"
          );
        })
        .finally(() => pending.delete(request));
      pending.add(request);
    };

    yDoc.on("update", sendUpdate);

    const unsubscribeRemote = window.electronAPI.collaboration.onUpdate(
      (event) => {
        if (disposed || event.documentId !== documentId) return;
        try {
          Y.applyUpdate(yDoc, new Uint8Array(event.update), REMOTE_ORIGIN);
        } catch (error) {
          log.debug(
            `Failed to apply collaborative update ${event.updateId}: ${error}`,
            "useDocumentSync"
          );
        }
      }
    );

    const connect = async () => {
      try {
        const response = await window.electronAPI.collaboration.subscribe(
          documentId,
          Y.encodeStateVector(yDoc)
        );
        if (disposed) return;

        Y.applyUpdate(
          yDoc,
          new Uint8Array(response.update),
          REMOTE_ORIGIN
        );
        subscribed = true;

        if (response.legacyBlocks.length > 0) {
          editor.replaceBlocks(editor.document, response.legacyBlocks as any);
        }

        // The collaboration extension may have initialized the local fragment
        // before the update listener was connected. Send the complete local
        // state once; Yjs safely deduplicates state already known by main.
        applyingBootstrap = false;
        const initialUpdate = Y.encodeStateAsUpdate(yDoc);
        if (initialUpdate.length > 2) {
          sendUpdate(initialUpdate, { kind: "initial-sync" });
        }
      } catch (error) {
        log.debug(
          `Failed to subscribe to document ${documentId}: ${error}`,
          "useDocumentSync"
        );
      } finally {
        applyingBootstrap = false;
      }
    };

    void connect();

    return () => {
      disposed = true;
      yDoc.off("update", sendUpdate);
      unsubscribeRemote();
      if (subscribed) {
        void Promise.allSettled(Array.from(pending)).finally(() => {
          void window.electronAPI.collaboration.unsubscribe(documentId);
        });
      }
    };
  }, [documentId, editor, yDoc]);
};
