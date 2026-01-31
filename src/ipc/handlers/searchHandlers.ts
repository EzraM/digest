import { SearchIndexManager } from "../../domains/search/services/SearchIndexManager";
import type { RetrievalContext } from "../../domains/search/core/types";
import { IPCHandlerMap } from "../IPCRouter";

export function createSearchHandlers(
  searchIndexManager: SearchIndexManager
): IPCHandlerMap {
  return {
    "search:execute": {
      type: "invoke",
      fn: async (
        _event,
        query: string,
        context?: RetrievalContext,
        limit?: number
      ) => {
        return await searchIndexManager.search(query, context, limit);
      },
    },
    "search:get-stats": {
      type: "invoke",
      fn: async () => {
        return await searchIndexManager.getStats();
      },
    },
  };
}
