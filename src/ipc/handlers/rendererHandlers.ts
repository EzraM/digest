import { IPCHandlerMap } from "../IPCRouter";
import { log } from "../../utils/mainLogger";

export function createRendererHandlers(): IPCHandlerMap {
  return {
    "renderer-log": {
      type: "on",
      fn: (
        _event,
        logData: {
          level: string;
          message: string;
          timestamp: string;
          source: string;
        }
      ) => {
        const { level, message, source } = logData;
        const safeLevel = (level || "debug").toUpperCase();
        const safeMessage = message || "No message";
        const safeSource = source || "unknown";

        log.debug(
          `[RENDERER-${safeLevel}] ${safeSource} - ${safeMessage}`,
          "renderer-console"
        );
      },
    },
  };
}
