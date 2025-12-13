import { useState } from "react";
import { log } from "../utils/rendererLogger";

/**
 * Hook for capturing browser selection and creating clip drafts
 * Returns loading state and capture function
 */
export const useClipCapture = () => {
  const [isCapturing, setIsCapturing] = useState(false);

  const captureSelection = async (viewId: string): Promise<{
    success: boolean;
    error?: string;
  }> => {
    try {
      setIsCapturing(true);
      log.debug(`Capturing selection for view ${viewId}`, "useClipCapture");

      const result = await window.electronAPI.captureBrowserSelection(viewId);

      if (result.success) {
        log.debug(
          `Successfully captured selection: ${result.selectionText?.length || 0} chars`,
          "useClipCapture"
        );
        return { success: true };
      } else {
        log.debug(
          `Failed to capture selection: ${result.error}`,
          "useClipCapture"
        );
        return { success: false, error: result.error };
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      log.debug(`Error capturing selection: ${errorMessage}`, "useClipCapture");
      return { success: false, error: errorMessage };
    } finally {
      setIsCapturing(false);
    }
  };

  return {
    isCapturing,
    captureSelection,
  };
};

