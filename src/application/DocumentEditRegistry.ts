/**
 * Models the first-release single-editor boundary. Viewing and loading remain
 * multi-window; selecting a document transfers its edit lease to that renderer.
 */
export class DocumentEditRegistry {
  private readonly documentIdByRendererId = new Map<number, string>();
  private readonly rendererIdByDocumentId = new Map<string, number>();

  acquire(documentId: string, rendererId: number): number | undefined {
    const previousRendererId = this.rendererIdByDocumentId.get(documentId);
    const previousDocumentId = this.documentIdByRendererId.get(rendererId);
    if (previousDocumentId && previousDocumentId !== documentId) {
      this.rendererIdByDocumentId.delete(previousDocumentId);
    }
    if (
      previousRendererId !== undefined &&
      previousRendererId !== rendererId
    ) {
      this.documentIdByRendererId.delete(previousRendererId);
    }
    this.documentIdByRendererId.set(rendererId, documentId);
    this.rendererIdByDocumentId.set(documentId, rendererId);
    return previousRendererId;
  }

  requireOwner(documentId: string, rendererId: number): void {
    if (this.rendererIdByDocumentId.get(documentId) !== rendererId) {
      throw new Error(`Renderer does not own the edit lease for ${documentId}`);
    }
  }

  releaseRenderer(rendererId: number): void {
    const documentId = this.documentIdByRendererId.get(rendererId);
    this.documentIdByRendererId.delete(rendererId);
    if (documentId && this.rendererIdByDocumentId.get(documentId) === rendererId) {
      this.rendererIdByDocumentId.delete(documentId);
    }
  }
}
