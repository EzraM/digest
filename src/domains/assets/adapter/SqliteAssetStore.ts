import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { assetAddress } from "../core/AssetAddress";
import type {
  AssetInfo,
  AssetRef,
  SaveAssetInput,
  StoredAsset,
} from "../core/types";

const MAX_ASSET_BYTES = 50 * 1024 * 1024;

export class SqliteAssetStore {
  constructor(private readonly database: Database.Database) {}

  save(input: SaveAssetInput): AssetRef {
    if (!input.mediaType.startsWith("image/")) {
      throw new Error(`Unsupported asset media type: ${input.mediaType}`);
    }
    const bytes =
      input.bytes instanceof ArrayBuffer
        ? Buffer.from(input.bytes)
        : Buffer.from(
            input.bytes.buffer,
            input.bytes.byteOffset,
            input.bytes.byteLength
          );
    if (bytes.byteLength > MAX_ASSET_BYTES) {
      throw new Error(
        `Asset too large: ${bytes.byteLength} bytes. Maximum size is ${MAX_ASSET_BYTES} bytes`
      );
    }

    const id = randomUUID();
    const documentId =
      input.owner?.kind === "document" ? input.owner.id : null;
    this.database
      .prepare(`
        INSERT INTO images (
          id, file_name, mime_type, byte_length, width, height,
          created_at, owner_profile_id, document_id, blob
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        id,
        input.name,
        input.mediaType,
        bytes.byteLength,
        input.width ?? null,
        input.height ?? null,
        Date.now(),
        input.ownerProfileId ?? null,
        documentId,
        bytes
      );

    return {
      id,
      url: assetAddress.create(id),
      mediaType: input.mediaType,
      width: input.width ?? null,
      height: input.height ?? null,
    };
  }

  open(id: string): StoredAsset | null {
    const row = this.database
      .prepare(`
        SELECT id, file_name, mime_type, byte_length, width, height,
               created_at, owner_profile_id, document_id, blob
        FROM images WHERE id = ?
      `)
      .get(id) as any;
    return row ? this.toStoredAsset(row) : null;
  }

  info(id: string): AssetInfo | null {
    const asset = this.open(id);
    if (!asset) return null;
    const { bytes: _bytes, ownerProfileId: _ownerProfileId, ...info } = asset;
    return info;
  }

  attach(id: string, documentId: string): boolean {
    return (
      this.database
        .prepare("UPDATE images SET document_id = ? WHERE id = ?")
        .run(documentId, id).changes > 0
    );
  }

  delete(id: string): boolean {
    return (
      this.database.prepare("DELETE FROM images WHERE id = ?").run(id).changes >
      0
    );
  }

  deleteByDocument(documentId: string): number {
    return this.database
      .prepare("DELETE FROM images WHERE document_id = ?")
      .run(documentId).changes;
  }

  private toStoredAsset(row: any): StoredAsset {
    return {
      id: row.id,
      name: row.file_name,
      mediaType: row.mime_type,
      byteLength: row.byte_length,
      width: row.width,
      height: row.height,
      createdAt: row.created_at,
      ownerProfileId: row.owner_profile_id,
      documentId: row.document_id,
      bytes: row.blob,
    };
  }
}
