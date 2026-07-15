import { Menu, WebContents } from "electron";
import type { ContextMenuParams } from "electron";
import { log } from "../../../utils/mainLogger";
import { toBlockId } from "../../../utils/viewId";

export type ImageContextCallback = (payload: {
  viewId: string;
  blockId: string;
  webContents: WebContents;
  imageUrl: string;
  altText?: string;
  width?: number;
  height?: number;
}) => Promise<void> | void;

/** Owns context-menu presentation and actions for embedded browser views. */
export class ContextMenuController {
  private onImageContext?: ImageContextCallback;

  setImageContextCallback(callback: ImageContextCallback): void {
    this.onImageContext = callback;
  }

  open(id: string, webContents: WebContents, params: ContextMenuParams): void {
    if (params.mediaType !== "image" || !params.srcURL) {
      return;
    }

    log.debug(
      `[${id}] Image context click detected: ${params.srcURL}`,
      "ContextMenuController"
    );

    const menu = Menu.buildFromTemplate([
      {
        label: "Copy Image",
        click: () => {
          if (!webContents.isDestroyed()) {
            webContents.copyImageAt(params.x, params.y);
          }
        },
      },
      {
        label: "Clip Image",
        enabled: Boolean(this.onImageContext),
        click: () => this.clipImage(id, webContents, params),
      },
    ]);

    menu.popup();
  }

  private clipImage(
    id: string,
    webContents: WebContents,
    params: ContextMenuParams
  ): void {
    if (!this.onImageContext) {
      log.debug(
        `[${id}] No image context callback registered`,
        "ContextMenuController"
      );
      return;
    }

    void this.captureImageContext(
      webContents,
      params.x,
      params.y,
      params.srcURL
    )
      .then((image) =>
        this.onImageContext?.({
          viewId: id,
          blockId: toBlockId(id),
          webContents,
          imageUrl: image.imageUrl,
          altText: image.altText,
          width: image.width,
          height: image.height,
        })
      )
      .catch((error) => {
        log.debug(
          `[${id}] Failed to capture image context: ${error}`,
          "ContextMenuController"
        );
      });
  }

  private async captureImageContext(
    webContents: WebContents,
    x: number,
    y: number,
    fallbackUrl: string
  ): Promise<{
    imageUrl: string;
    altText?: string;
    width?: number;
    height?: number;
  }> {
    const script = `
      (async () => {
        const el = document.elementFromPoint(${JSON.stringify(x)}, ${JSON.stringify(y)});
        const img = el?.closest?.("img") ?? (el?.tagName === "IMG" ? el : null);
        if (!img) {
          return { imageUrl: ${JSON.stringify(fallbackUrl)} };
        }

        const src = img.currentSrc || img.src || ${JSON.stringify(fallbackUrl)};
        let imageUrl = src;

        if (src.startsWith("blob:")) {
          try {
            const response = await fetch(src);
            const blob = await response.blob();
            imageUrl = await new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(String(reader.result));
              reader.onerror = () => reject(reader.error);
              reader.readAsDataURL(blob);
            });
          } catch {
            imageUrl = ${JSON.stringify(fallbackUrl)};
          }
        }

        return {
          imageUrl,
          altText: img.alt || "",
          width: img.naturalWidth || undefined,
          height: img.naturalHeight || undefined
        };
      })();
    `;

    const result = await webContents.executeJavaScript(script, true);
    return {
      imageUrl: result?.imageUrl || fallbackUrl,
      altText: result?.altText || undefined,
      width: Number.isFinite(result?.width) ? result.width : undefined,
      height: Number.isFinite(result?.height) ? result.height : undefined,
    };
  }
}
