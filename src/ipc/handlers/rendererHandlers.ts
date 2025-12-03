import { IPCHandlerMap } from "../IPCRouter";
import { log } from "../../utils/mainLogger";

interface RendererHandlersConfig {
  loadInitialDocument: () => Promise<void>;
  broadcastProfiles: () => void;
  broadcastDocumentTree: (profileId: string | null) => void;
  broadcastActiveDocument: () => void;
  getActiveProfileId: () => string | null;
}

export function createRendererHandlers(config: RendererHandlersConfig): IPCHandlerMap {
  return {
    "renderer-ready": {
      type: "on",
      fn: async () => {
        await config.loadInitialDocument();
        config.broadcastProfiles();
        config.broadcastDocumentTree(config.getActiveProfileId());
        config.broadcastActiveDocument();
      },
    },
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
