import Database from "better-sqlite3";
import { net } from "electron";
import { log } from "../utils/mainLogger";

// Simple ID generator
const generateId = () =>
  `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

export interface ImageRecord {
  id: string;
  file_name: string;
  mime_type: string;
  byte_length: number;
  width: number | null;
  height: number | null;
  created_at: number;
  owner_profile_id: string | null;
  document_id: string | null;
  blob: Buffer;
}

export interface SaveImageParams {
  arrayBuffer: ArrayBuffer;
  mimeType: string;
  fileName: string;
  width?: number;
  height?: number;
  documentId?: string;
  ownerProfileId?: string;
}

export interface SaveImageResult {
  id: string;
  url: string;
  width: number | null;
  height: number | null;
}

export interface ImageInfo {
  id: string;
  file_name: string;
  mime_type: string;
  byte_length: number;
  width: number | null;
  height: number | null;
  created_at: number;
  document_id: string | null;
}

/**
 * Service for managing image storage in SQLite
 */
export class ImageService {
  private static instance: ImageService | null = null;
  private database: Database.Database;

  private constructor(database: Database.Database) {
    this.database = database;
    log.debug("ImageService initialized", "ImageService");
  }

  public static getInstance(database: Database.Database): ImageService {
    if (!ImageService.instance) {
      ImageService.instance = new ImageService(database);
    }
    return ImageService.instance;
  }

  /**
   * Save an image to the database
   */
  async saveImage(params: SaveImageParams): Promise<SaveImageResult> {
    log.debug(
      `saveImage called: ${params.fileName}, type: ${params.mimeType}, size: ${params.arrayBuffer.byteLength}`,
      "ImageService"
    );

    const {
      arrayBuffer,
      mimeType,
      fileName,
      width,
      height,
      documentId,
      ownerProfileId,
    } = params;

    // Validate MIME type (basic check)
    if (!mimeType.startsWith("image/")) {
      log.debug(`Invalid MIME type: ${mimeType}`, "ImageService");
      throw new Error(`Invalid MIME type: ${mimeType}. Expected image/*`);
    }

    // Convert ArrayBuffer or Uint8Array to Buffer
    // Electron IPC may convert ArrayBuffer to Uint8Array during serialization
    let blob: Buffer;
    if (arrayBuffer instanceof ArrayBuffer) {
      blob = Buffer.from(arrayBuffer);
    } else if (arrayBuffer instanceof Uint8Array) {
      // Handle Uint8Array received from IPC
      blob = Buffer.from(
        arrayBuffer.buffer,
        arrayBuffer.byteOffset,
        arrayBuffer.byteLength
      );
    } else {
      log.debug(
        `Unexpected arrayBuffer type: ${typeof arrayBuffer}, constructor: ${arrayBuffer?.constructor?.name}`,
        "ImageService"
      );
      // Try to convert anyway
      blob = Buffer.from(arrayBuffer as any);
    }
    const byteLength = blob.length;

    // Basic size validation (soft limit for prototype - 50MB)
    const MAX_SIZE = 50 * 1024 * 1024; // 50MB
    if (byteLength > MAX_SIZE) {
      throw new Error(
        `Image too large: ${byteLength} bytes. Maximum size is ${MAX_SIZE} bytes`
      );
    }

    const id = generateId();
    const createdAt = Date.now();

    const insertStmt = this.database.prepare(`
      INSERT INTO images (
        id, file_name, mime_type, byte_length, width, height,
        created_at, owner_profile_id, document_id, blob
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertStmt.run(
      id,
      fileName,
      mimeType,
      byteLength,
      width ?? null,
      height ?? null,
      createdAt,
      ownerProfileId ?? null,
      documentId ?? null,
      blob
    );

    log.debug(
      `Image saved: ${id} (${fileName}, ${byteLength} bytes, ${mimeType})`,
      "ImageService"
    );

    return {
      id,
      url: `digest-image://${id}`,
      width: width ?? null,
      height: height ?? null,
    };
  }

  /**
   * Get image blob and metadata by ID
   */
  getImage(id: string): ImageRecord | null {
    const stmt = this.database.prepare(`
      SELECT id, file_name, mime_type, byte_length, width, height,
             created_at, owner_profile_id, document_id, blob
      FROM images
      WHERE id = ?
    `);

    const row = stmt.get(id) as any;
    if (!row) {
      return null;
    }

    return {
      id: row.id,
      file_name: row.file_name,
      mime_type: row.mime_type,
      byte_length: row.byte_length,
      width: row.width,
      height: row.height,
      created_at: row.created_at,
      owner_profile_id: row.owner_profile_id,
      document_id: row.document_id,
      blob: row.blob,
    };
  }

  /**
   * Get image metadata without blob
   */
  getImageInfo(id: string): ImageInfo | null {
    const stmt = this.database.prepare(`
      SELECT id, file_name, mime_type, byte_length, width, height,
             created_at, document_id
      FROM images
      WHERE id = ?
    `);

    const row = stmt.get(id) as any;
    if (!row) {
      return null;
    }

    return {
      id: row.id,
      file_name: row.file_name,
      mime_type: row.mime_type,
      byte_length: row.byte_length,
      width: row.width,
      height: row.height,
      created_at: row.created_at,
      document_id: row.document_id,
    };
  }

  /**
   * Delete images by document ID (for cleanup)
   */
  deleteImagesByDocumentId(documentId: string): number {
    const stmt = this.database.prepare(`
      DELETE FROM images
      WHERE document_id = ?
    `);

    const result = stmt.run(documentId);
    log.debug(
      `Deleted ${result.changes} images for document ${documentId}`,
      "ImageService"
    );
    return result.changes;
  }

  /**
   * Delete image by ID
   */
  deleteImage(imageId: string): boolean {
    const stmt = this.database.prepare(`
      DELETE FROM images
      WHERE id = ?
    `);

    const result = stmt.run(imageId);
    const deleted = result.changes > 0;
    if (deleted) {
      log.debug(`Deleted image: ${imageId}`, "ImageService");
    }
    return deleted;
  }

  /**
   * Download an image from a URL and save it to the database.
   * Uses Electron's net module to bypass CORS restrictions.
   */
  async downloadAndSaveImage(params: {
    url: string;
    documentId?: string;
  }): Promise<SaveImageResult | null> {
    const { url, documentId } = params;

    log.debug(`downloadAndSaveImage: ${url}`, "ImageService");

    // Skip non-http(s) URLs, data URIs, and already-saved images
    if (url.startsWith("digest-image://")) {
      log.debug(`Skipping already-saved image: ${url}`, "ImageService");
      return null;
    }
    if (url.startsWith("data:")) {
      log.debug(`Skipping data URI`, "ImageService");
      return null;
    }
    if (!/^https?:\/\//i.test(url)) {
      log.debug(`Skipping non-http URL: ${url}`, "ImageService");
      return null;
    }

    try {
      const response = await net.fetch(url);

      if (!response.ok) {
        log.debug(
          `Failed to download image: HTTP ${response.status} for ${url}`,
          "ImageService"
        );
        return null;
      }

      const contentType = response.headers.get("content-type") || "";
      // Determine MIME type - default to image/png if content-type is missing or not an image
      let mimeType = "image/png";
      if (contentType.startsWith("image/")) {
        mimeType = contentType.split(";")[0].trim();
      }

      const arrayBuffer = await response.arrayBuffer();
      if (arrayBuffer.byteLength === 0) {
        log.debug(`Empty response for image: ${url}`, "ImageService");
        return null;
      }

      // Extract a filename from the URL
      let fileName = "clipped-image";
      try {
        const urlPath = new URL(url).pathname;
        const lastSegment = urlPath.split("/").pop();
        if (lastSegment && lastSegment.includes(".")) {
          fileName = lastSegment;
        }
      } catch {
        // Keep default filename
      }

      return await this.saveImage({
        arrayBuffer,
        mimeType,
        fileName,
        documentId,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      log.debug(
        `Failed to download image from ${url}: ${msg}`,
        "ImageService"
      );
      return null;
    }
  }

  /**
   * Extract image IDs from a digest-image:// URL
   */
  static extractImageIdFromUrl(url: string): string | null {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === "digest-image:") {
        return (
          parsed.hostname || parsed.pathname.replace(/^\//, "").split("/")[0]
        );
      }
    } catch {
      // Invalid URL
    }
    return null;
  }

  /**
   * Extract all image IDs from a block (recursively searches block props)
   */
  static extractImageIdsFromBlock(block: any): string[] {
    const imageIds: string[] = [];

    const extractFromValue = (value: any): void => {
      if (typeof value === "string") {
        const imageId = ImageService.extractImageIdFromUrl(value);
        if (imageId) {
          imageIds.push(imageId);
        }
      } else if (Array.isArray(value)) {
        value.forEach(extractFromValue);
      } else if (value && typeof value === "object") {
        Object.values(value).forEach(extractFromValue);
      }
    };

    // Search block props for image URLs
    if (block?.props) {
      extractFromValue(block.props);
    }

    // Also check children blocks
    if (block?.children) {
      block.children.forEach((child: any) => {
        imageIds.push(...ImageService.extractImageIdsFromBlock(child));
      });
    }

    return imageIds;
  }
}


