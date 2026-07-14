import { useEffect } from "react";
import { useClipDraftContext } from "../context/ClipDraftContext";
import { ClipService } from "../domains/clip/services/ClipService";
import { log } from "../utils/rendererLogger";

/**
 * Listens for right-click image clips from browser WebContents and creates drafts.
 */
export const useBrowserImageClips = () => {
  const { addDraft } = useClipDraftContext();
  const clipService = ClipService.getInstance();

  useEffect(() => {
    const unsubscribe = window.electronAPI.onBrowserImageClipped((data) => {
      log.debug(
        `Received clipped image ${data.imageId} from block ${data.blockId}`,
        "useBrowserImageClips"
      );

      const alt = data.altText ? ` alt="${escapeHtml(data.altText)}"` : "";
      const width = data.width ? ` width="${data.width}"` : "";
      const height = data.height ? ` height="${data.height}"` : "";

      const draft = clipService.createDraft({
        sourceUrl: data.sourceUrl,
        sourceTitle: data.sourceTitle,
        selectionText: data.altText || "",
        selectionHtml: `<img src="${data.localImageUrl}"${alt}${width}${height}>`,
        context: {
          frameUrl: data.sourceUrl,
          originalImageUrl: data.originalImageUrl,
          localImageUrl: data.localImageUrl,
          imageIds: [data.imageId],
        },
      });

      addDraft(draft);
    });

    return unsubscribe;
  }, [addDraft, clipService]);
};

const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
