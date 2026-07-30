import type { Session } from "electron";
import { ElectronAssetImporter } from "../adapter/ElectronAssetImporter";
import { SqliteAssetStore } from "../adapter/SqliteAssetStore";
import type { AssetOwner, SaveAssetInput } from "../core/types";
import { AssetLifecycle } from "./AssetLifecycle";

/**
 * The application-facing asset capability. IPC and Electron protocol adapters
 * expose this API; callers do not need to know how bytes are persisted.
 */
export class AssetService {
  readonly importer: ElectronAssetImporter;
  readonly lifecycle: AssetLifecycle;

  constructor(readonly store: SqliteAssetStore) {
    this.importer = new ElectronAssetImporter(store);
    this.lifecycle = new AssetLifecycle(store);
  }

  save(input: SaveAssetInput) {
    return this.importer.import(
      {
        kind: "bytes",
        bytes: input.bytes,
        mediaType: input.mediaType,
        name: input.name,
      },
      input
    );
  }

  importUrl(params: {
    url: string;
    name?: string;
    width?: number;
    height?: number;
    owner?: AssetOwner;
    session?: Session;
  }) {
    if (params.url.startsWith("data:")) {
      return this.importer.import({ kind: "data-url", url: params.url }, params);
    }
    return this.importer.import(
      { kind: "url", url: params.url, session: params.session },
      params
    );
  }

  info(id: string) {
    return this.store.info(id);
  }

  attach(params: { assetId: string; owner: AssetOwner }) {
    return this.lifecycle.attach(params.assetId, params.owner);
  }

  release(assetId: string) {
    return this.lifecycle.release(assetId);
  }
}
