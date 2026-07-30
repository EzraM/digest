import type { AssetOwner } from "../core/types";
import { SqliteAssetStore } from "../adapter/SqliteAssetStore";

export class AssetLifecycle {
  constructor(private readonly store: SqliteAssetStore) {}

  attach(assetId: string, owner: AssetOwner): boolean {
    if (owner.kind !== "document") return false;
    return this.store.attach(assetId, owner.id);
  }

  release(assetId: string): boolean {
    return this.store.delete(assetId);
  }

  releaseDocument(documentId: string): number {
    return this.store.deleteByDocument(documentId);
  }
}
