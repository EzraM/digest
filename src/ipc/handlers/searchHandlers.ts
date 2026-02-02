import { SearchIndexManager } from "../../domains/search/services/SearchIndexManager";
import type { BraveSearchService } from "../../domains/search/services/BraveSearchService";
import type { RetrievalContext } from "../../domains/search/core/types";
import { IPCHandlerMap } from "../IPCRouter";

export interface SearchWebSearchOptions {
  country?: string;
  count?: number;
}

export function createSearchHandlers(
  searchIndexManager: SearchIndexManager,
  braveSearchService: BraveSearchService
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
    "search:webSearch": {
      type: "invoke",
      fn: async (_event, query: string, options?: SearchWebSearchOptions) => {
        return await braveSearchService.webSearch(query, options);
      },
    },
  };
}
