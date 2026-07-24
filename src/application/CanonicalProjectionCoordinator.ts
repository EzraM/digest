import type { Block } from "../domains/blocks/core";

export type CanonicalProjection = {
  documentId: string;
  blocks: Block[];
};

type Dependencies = {
  reindexDocument: (documentId: string, blocks: Block[]) => Promise<void>;
  extractImageIds: (blocks: Block[]) => Set<string>;
  deleteImage: (imageId: string) => boolean;
  updateBlockCount: (documentId: string, blockCount: number) => void;
  countBlocks: (blocks: Block[]) => number;
  onError?: (documentId: string, error: unknown) => void;
  debounceMs?: number;
};

/**
 * Debounces derived projections of canonical Yjs state. Search, image cleanup,
 * and metadata are consumers of accepted canonical state, not renderer IPC.
 */
export class CanonicalProjectionCoordinator {
  private readonly latestByDocumentId = new Map<string, CanonicalProjection>();
  private readonly imageIdsByDocumentId = new Map<string, Set<string>>();
  private readonly timerByDocumentId = new Map<
    string,
    ReturnType<typeof setTimeout>
  >();

  constructor(private readonly dependencies: Dependencies) {}

  seed(projection: CanonicalProjection): void {
    this.imageIdsByDocumentId.set(
      projection.documentId,
      this.dependencies.extractImageIds(projection.blocks)
    );
    this.schedule(projection);
  }

  schedule(projection: CanonicalProjection): void {
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
      const nextImageIds = this.dependencies.extractImageIds(projection.blocks);
      const previousImageIds =
        this.imageIdsByDocumentId.get(documentId) ?? new Set<string>();
      for (const imageId of previousImageIds) {
        if (!nextImageIds.has(imageId)) {
          this.dependencies.deleteImage(imageId);
        }
      }
      this.imageIdsByDocumentId.set(documentId, nextImageIds);
      this.dependencies.updateBlockCount(
        documentId,
        this.dependencies.countBlocks(projection.blocks)
      );
      await this.dependencies.reindexDocument(
        documentId,
        projection.blocks
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
