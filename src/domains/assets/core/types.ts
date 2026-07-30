export type AssetOwner =
  | { kind: "draft"; id: string }
  | { kind: "document"; id: string };

export type AssetRef = {
  id: string;
  url: string;
  mediaType: string;
  width: number | null;
  height: number | null;
};

export type StoredAsset = {
  id: string;
  name: string;
  mediaType: string;
  byteLength: number;
  width: number | null;
  height: number | null;
  createdAt: number;
  ownerProfileId: string | null;
  documentId: string | null;
  bytes: Buffer;
};

export type AssetInfo = Omit<StoredAsset, "bytes" | "ownerProfileId">;

export type SaveAssetInput = {
  bytes: ArrayBuffer | Uint8Array;
  mediaType: string;
  name: string;
  width?: number;
  height?: number;
  owner?: AssetOwner;
  ownerProfileId?: string;
};

export type ImportAssetOptions = {
  name?: string;
  width?: number;
  height?: number;
  owner?: AssetOwner;
};
