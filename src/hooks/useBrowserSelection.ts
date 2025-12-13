import { useEffect } from "react";
import { useClipDraftContext } from "../context/ClipDraftContext";
import { ClipService } from "../services/ClipService";
import { log } from "../utils/rendererLogger";

/**
 * Hook to listen for browser:selection events and create clip drafts
 */
export const useBrowserSelection = () => {
  const { addDraft } = useClipDraftContext();
  const clipService = ClipService.getInstance();

  useEffect(() => {
    const unsubscribe = window.electronAPI.onBrowserSelection((data) => {
      log.debug(
        `Received browser selection from block ${data.blockId}`,
        "useBrowserSelection"
      );

      // Create a clip draft from the selection
      const draft = clipService.createDraft({
        sourceUrl: data.sourceUrl,
        sourceTitle: data.sourceTitle,
        selectionText: data.selectionText,
        selectionHtml: data.selectionHtml,
        context: {
          frameUrl: data.sourceUrl,
        },
      });

      // Add to context (which will trigger conversion)
      addDraft(draft);
    });

    return unsubscribe;
  }, [addDraft]);
};



