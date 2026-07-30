import { WebContentsView } from "electron";
import path from "path";
import { log } from "../utils/mainLogger";

export const setupRendererLogging = (rendererView: WebContentsView) => {
  rendererView.webContents.on(
    "console-message",
    ({ level, message, lineNumber, sourceId }) => {
      const logLevel =
        level === "info"
          ? "info"
          : level === "warning"
            ? "warn"
            : level === "error"
              ? "error"
              : "debug";
      const source = sourceId ? path.basename(sourceId) : "renderer";

      log.debug(
        `[RENDERER-${logLevel.toUpperCase()}] ${source}:${lineNumber} - ${message}`,
        "renderer-console"
      );
    }
  );

  rendererView.webContents.on(
    "render-process-gone",
    (_event: unknown, details: { reason: string; exitCode: number }) => {
      log.debug(
        `Renderer process gone. Reason: ${details.reason}, Exit code: ${details.exitCode}`,
        "renderer-crash"
      );
    }
  );

  rendererView.webContents.on("unresponsive", () => {
    log.debug("Renderer process became unresponsive", "renderer-unresponsive");
  });

  rendererView.webContents.on("responsive", () => {
    log.debug(
      "Renderer process became responsive again",
      "renderer-responsive"
    );
  });
};
