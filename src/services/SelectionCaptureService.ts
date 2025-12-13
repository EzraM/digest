import { WebContents } from "electron";
import { log } from "../utils/mainLogger";

/**
 * Service for capturing text/HTML selection from browser WebContents
 */
export class SelectionCaptureService {
  /**
   * Capture selection from a WebContents
   * Executes JavaScript in the page to get selection
   */
  async captureSelection(
    webContents: WebContents,
    sourceUrl: string,
    sourceTitle: string
  ): Promise<{
    success: boolean;
    selectionText?: string;
    selectionHtml?: string;
    error?: string;
  }> {
    try {
      log.debug(
        `Capturing selection from ${sourceUrl}`,
        "SelectionCaptureService"
      );

      // Execute JavaScript to capture selection
      const result = await webContents.executeJavaScript(`
        (function() {
          try {
            const selection = window.getSelection();
            if (!selection || selection.rangeCount === 0) {
              return {
                success: false,
                error: 'No selection found'
              };
            }

            const range = selection.getRangeAt(0);
            const text = selection.toString();
            
            // Clone the selected content to extract HTML
            const container = document.createElement('div');
            container.appendChild(range.cloneContents());
            const html = container.innerHTML;

            // Get selection bounding rect for context
            const rect = range.getBoundingClientRect();

            return {
              success: true,
              selectionText: text,
              selectionHtml: html,
              selectionRect: {
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height
              }
            };
          } catch (error) {
            return {
              success: false,
              error: error.message || 'Unknown error'
            };
          }
        })();
      `);

      if (result.success) {
        log.debug(
          `Captured selection: ${result.selectionText?.length || 0} chars`,
          "SelectionCaptureService"
        );
        return {
          success: true,
          selectionText: result.selectionText || "",
          selectionHtml: result.selectionHtml || "",
        };
      } else {
        log.debug(
          `Failed to capture selection: ${result.error}`,
          "SelectionCaptureService"
        );
        return {
          success: false,
          error: result.error || "Unknown error",
        };
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      log.debug(
        `Error capturing selection: ${errorMessage}`,
        "SelectionCaptureService"
      );
      return {
        success: false,
        error: errorMessage,
      };
    }
  }
}



