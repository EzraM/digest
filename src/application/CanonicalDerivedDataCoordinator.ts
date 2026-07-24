import type { Block } from "../domains/blocks/core";
import {
  analyzeCanonicalDocument,
  type ProseMirrorJsonNode,
} from "./analyzeCanonicalDocument";

export type CanonicalDocumentSnapshot = {
  documentId: string;
  prosemirrorJson: ProseMirrorJsonNode;
};

type Dependencies = {
  reindexDocument: (documentId: string, blocks: Block[]) => Promise<void>;
  deleteImage: (imageId: string) => boolean;
  onError?: (documentId: string, error: unknown) => void;
  debounceMs?: number;
};

/**
 * Debounces derived projections of canonical Yjs state. Search, image cleanup,
 * and metadata are consumers of accepted canonical state, not renderer IPC.
 */
export class CanonicalDerivedDataCoordinator {
  private readonly latestByDocumentId = new Map<string, CanonicalDocumentSnapshot>();
  private readonly imageIdsByDocumentId = new Map<string, Set<string>>();
  private readonly timerByDocumentId = new Map<
    string,
    ReturnType<typeof setTimeout>
  >();

  constructor(private readonly dependencies: Dependencies) {}

  seed(projection: CanonicalDocumentSnapshot): void {
    const analysis = analyzeCanonicalDocument(projection.prosemirrorJson);
    this.imageIdsByDocumentId.set(
      projection.documentId,
      analysis.imageIds
    );
    this.schedule(projection);
  }

  schedule(projection: CanonicalDocumentSnapshot): void {
    this.latestByDocumentId.set(projection.documentId, projection);
    const existing = this.timerByDocumentId.get(projection.documentId);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(
      () => void this.flush(projection.documentId),
      this.dependencies.debounceMs ?? 300
    );
    this.timerByDocumentId.set(projection.documentId, timer);
  }

  async flush(documentId: string): Promise<void> {
    const timer = this.timerByDocumentId.get(documentId);
    if (timer) clearTimeout(timer);
    this.timerByDocumentId.delete(documentId);
    const projection = this.latestByDocumentId.get(documentId);
    if (!projection) return;
    this.latestByDocumentId.delete(documentId);

    try {
      const analysis = analyzeCanonicalDocument(projection.prosemirrorJson);
      const nextImageIds = analysis.imageIds;
      const previousImageIds =
        this.imageIdsByDocumentId.get(documentId) ?? new Set<string>();
      for (const imageId of previousImageIds) {
        if (!nextImageIds.has(imageId)) {
          this.dependencies.deleteImage(imageId);
        }
      }
      this.imageIdsByDocumentId.set(documentId, nextImageIds);
      await this.dependencies.reindexDocument(
        documentId,
        analysis.searchBlocks
      );
    } catch (error) {
      this.dependencies.onError?.(documentId, error);
    }
  }

  dispose(): void {
    for (const timer of this.timerByDocumentId.values()) {
      clearTimeout(timer);
    }
    this.timerByDocumentId.clear();
    this.latestByDocumentId.clear();
  }
}
