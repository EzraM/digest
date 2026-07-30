import type { Protocol } from "electron";
import { assetAddress } from "../core/AssetAddress";
import { SqliteAssetStore } from "./SqliteAssetStore";

export const registerAssetProtocol = (
  protocol: Protocol,
  store: SqliteAssetStore
): void => {
  protocol.handle("digest-image", async (request) => {
    const id = assetAddress.parse(request.url);
    if (!id) return new Response(null, { status: 404 });
    const asset = store.open(id);
    if (!asset) return new Response(null, { status: 404 });
    return new Response(new Uint8Array(asset.bytes), {
      headers: {
        "Content-Type": asset.mediaType,
        "Content-Length": String(asset.byteLength),
      },
    });
  });
};
