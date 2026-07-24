import Database from "better-sqlite3";
import * as Y from "yjs";
import { yXmlFragmentToProsemirrorJSON } from "y-prosemirror";
import type { ProseMirrorJsonNode } from "./analyzeCanonicalDocument";

export type CollaborationSubscription = {
  update: Uint8Array;
};

export type AcceptedCollaborationUpdate = {
  documentId: string;
  updateId: string;
  update: Uint8Array;
  producerRendererId: number;
};

type DocumentState = {
  doc: Y.Doc;
  queue: Promise<void>;
};

/**
 * Application-scoped in-process Yjs provider.
 *
 * Each renderer owns a separate Y.Doc. This service owns the canonical replica,
 * persists accepted incremental updates, and tracks which renderers should
 * receive them.
 */
export class CollaborationDocumentService {
  private readonly states = new Map<string, DocumentState>();
  private readonly documentIdByRendererId = new Map<number, string>();
  private readonly rendererIdsByDocumentId = new Map<string, Set<number>>();
  private readonly canonicalChangeListeners = new Set<
    (snapshot: {
      documentId: string;
      prosemirrorJson: ProseMirrorJsonNode;
    }) => void
  >();
  private publish: (event: AcceptedCollaborationUpdate) => void = () => undefined;

  constructor(private readonly database: Database.Database) {}

  setPublisher(
    publish: (event: AcceptedCollaborationUpdate) => void
  ): void {
    this.publish = publish;
  }

  subscribeCanonicalChanges(
    listener: (snapshot: {
      documentId: string;
      prosemirrorJson: ProseMirrorJsonNode;
    }) => void
  ): () => void {
    this.canonicalChangeListeners.add(listener);
    return () => this.canonicalChangeListeners.delete(listener);
  }

  subscribe(
    documentId: string,
    rendererId: number,
    stateVector: Uint8Array
  ): CollaborationSubscription {
    this.unsubscribe(rendererId);
    const state = this.getState(documentId);
    let subscribers = this.rendererIdsByDocumentId.get(documentId);
    if (!subscribers) {
      subscribers = new Set();
      this.rendererIdsByDocumentId.set(documentId, subscribers);
    }
    subscribers.add(rendererId);
    this.documentIdByRendererId.set(rendererId, documentId);

    return {
      update: Y.encodeStateAsUpdate(state.doc, stateVector),
    };
  }

  unsubscribe(rendererId: number): void {
    const documentId = this.documentIdByRendererId.get(rendererId);
    if (!documentId) return;
    this.documentIdByRendererId.delete(rendererId);
    const subscribers = this.rendererIdsByDocumentId.get(documentId);
    subscribers?.delete(rendererId);
    if (subscribers?.size === 0) {
      this.rendererIdsByDocumentId.delete(documentId);
    }
  }

  isSubscribed(documentId: string, rendererId: number): boolean {
    return this.documentIdByRendererId.get(rendererId) === documentId;
  }

  subscribers(documentId: string): number[] {
    return Array.from(this.rendererIdsByDocumentId.get(documentId) ?? []);
  }

  async applyUpdate(input: AcceptedCollaborationUpdate): Promise<{
    accepted: boolean;
    duplicate: boolean;
  }> {
    if (!this.isSubscribed(input.documentId, input.producerRendererId)) {
      throw new Error(
        `Renderer is not subscribed to document ${input.documentId}`
      );
    }

    const state = this.getState(input.documentId);
    let outcome = { accepted: false, duplicate: false };
    const work = state.queue.then(() => {
      const existing = this.database
        .prepare(
          "SELECT 1 FROM yjs_document_updates WHERE update_id = ? LIMIT 1"
        )
        .get(input.updateId);
      if (existing) {
        outcome = { accepted: true, duplicate: true };
        return;
      }

      // Validate against a temporary replica before making the update durable.
      const validationDoc = new Y.Doc();
      Y.applyUpdate(validationDoc, Y.encodeStateAsUpdate(state.doc));
      Y.applyUpdate(validationDoc, input.update);
      validationDoc.destroy();

      this.database
        .prepare(
          `INSERT INTO yjs_document_updates
            (update_id, document_id, update_data, producer_renderer_id, created_at)
           VALUES (?, ?, ?, ?, ?)`
        )
        .run(
          input.updateId,
          input.documentId,
          Buffer.from(input.update),
          input.producerRendererId,
          Date.now()
        );

      Y.applyUpdate(state.doc, input.update, {
        kind: "renderer",
        rendererId: input.producerRendererId,
        updateId: input.updateId,
      });
      outcome = { accepted: true, duplicate: false };
      this.publish(input);
      const snapshot = this.readCanonicalDocument(input.documentId);
      for (const listener of this.canonicalChangeListeners) {
        listener(snapshot);
      }
    });

    state.queue = work.catch(() => undefined);
    await work;
    return outcome;
  }

  encodeState(documentId: string): Uint8Array {
    return Y.encodeStateAsUpdate(this.getState(documentId).doc);
  }

  readCanonicalDocument(documentId: string): {
    documentId: string;
    prosemirrorJson: ProseMirrorJsonNode;
  } {
    const fragment = this.getState(documentId).doc.getXmlFragment("document");
    return {
      documentId,
      prosemirrorJson: yXmlFragmentToProsemirrorJSON(fragment),
    };
  }

  private getState(documentId: string): DocumentState {
    const existing = this.states.get(documentId);
    if (existing) return existing;

    const doc = new Y.Doc();
    const rows = this.database
      .prepare(
        `SELECT update_data
         FROM yjs_document_updates
         WHERE document_id = ?
         ORDER BY sequence ASC`
      )
      .all(documentId) as Array<{ update_data: Buffer }>;
    for (const row of rows) {
      Y.applyUpdate(doc, new Uint8Array(row.update_data));
    }

    const state = { doc, queue: Promise.resolve() };
    this.states.set(documentId, state);
    return state;
  }

}
