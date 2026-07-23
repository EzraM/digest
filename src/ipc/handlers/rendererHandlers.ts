import { IPCHandlerMap } from "../IPCRouter";
import { log } from "../../utils/mainLogger";

interface RendererHandlersConfig {
  loadInitialDocument: (rendererId: number) => Promise<void>;
  broadcastProfiles: (rendererId?: number) => void;
  broadcastDocumentTree: (profileId: string | null, rendererId?: number) => void;
  broadcastActiveDocument: (rendererId?: number) => void;
  getActiveProfileId: () => string | null;
}

export function createRendererHandlers(config: RendererHandlersConfig): IPCHandlerMap {
  return {
    "renderer-ready": {
      type: "on",
      fn: async (event) => {
        const rendererId = event.sender.id;
        await config.loadInitialDocument(rendererId);
        config.broadcastProfiles(rendererId);
        config.broadcastDocumentTree(config.getActiveProfileId(), rendererId);
        config.broadcastActiveDocument(rendererId);
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
