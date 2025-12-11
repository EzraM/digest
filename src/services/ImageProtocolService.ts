import { Protocol } from "electron";
import { log } from "../utils/mainLogger";
import { ImageService } from "./ImageService";

/**
 * Service for handling the digest-image:// custom protocol
 * Serves images from the database via a custom Electron protocol
 */
export class ImageProtocolService {
  private static instance: ImageProtocolService | null = null;
  private imageService: ImageService | null = null;

  private constructor() {
    log.debug("ImageProtocolService initialized", "ImageProtocolService");
  }

  public static getInstance(): ImageProtocolService {
    if (!ImageProtocolService.instance) {
      ImageProtocolService.instance = new ImageProtocolService();
    }
    return ImageProtocolService.instance;
  }

  /**
   * Initialize the protocol handler with the ImageService and protocol object
   */
  public initialize(imageService: ImageService, protocol: Protocol): void {
    this.imageService = imageService;
    this.registerProtocol(protocol);
  }

  /**
   * Register the digest-image:// custom protocol handler
   */
  private registerProtocol(protocol: Protocol): void {
    protocol.handle("digest-image", async (request) => {
      log.debug(
        `Protocol handler called for: ${request.url}`,
        "ImageProtocolService"
      );
      try {
        // For custom protocols like digest-image://id, the URL format is:
        // digest-image://id or digest-image://hostname/path
        // We'll extract the ID from the hostname (most common) or path
        const url = new URL(request.url);
        const imageId =
          url.hostname || url.pathname.replace(/^\//, "").split("/")[0];

        if (!imageId) {
          log.debug(
            `No image ID found in URL: ${request.url}`,
            "ImageProtocolService"
          );
          return new Response(null, { status: 404 });
        }

        if (!this.imageService) {
          log.debug("ImageService not available", "ImageProtocolService");
          return new Response(null, { status: 500 });
        }

        const image = this.imageService.getImage(imageId);

        if (!image) {
          log.debug(`Image not found: ${imageId}`, "ImageProtocolService");
          return new Response(null, { status: 404 });
        }

        log.debug(
          `Serving image ${imageId} (${image.mime_type}, ${image.byte_length} bytes)`,
          "ImageProtocolService"
        );

        // Convert Buffer to Uint8Array for Response compatibility
        const blobData = new Uint8Array(image.blob);
        return new Response(blobData, {
          headers: {
            "Content-Type": image.mime_type,
            "Content-Length": image.byte_length.toString(),
          },
        });
      } catch (error) {
        log.debug(
          `Error serving image from ${request.url}: ${error}`,
          "ImageProtocolService"
        );
        return new Response(null, { status: 500 });
      }
    });

    log.debug(
      "digest-image:// protocol handler registered",
      "ImageProtocolService"
    );
  }
}
