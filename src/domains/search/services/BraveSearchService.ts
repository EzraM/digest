/**
 * Brave Search Service
 *
 * Calls Brave Web Search API for web search results.
 * When BRAVE_SEARCH_API_KEY is missing or empty, no requests are made and [] is returned.
 */

import { getEnvVar } from "../../../config/environment";
import { log } from "../../../utils/mainLogger";

const BRAVE_WEB_SEARCH_URL =
  "https://api.search.brave.com/res/v1/web/search";

export interface BraveSearchOptions {
  country?: string;
  count?: number;
}

export interface BraveSearchResult {
  title: string;
  url: string;
  description: string;
}

/**
 * Brave Web Search API response shape.
 * @see https://api.search.brave.com/res/v1/web/search
 */
interface BraveWebSearchResponse {
  web?: {
    results?: Array<{
      title?: string;
      url?: string;
      description?: string;
    }>;
  };
}

export class BraveSearchService {
  /** One-time log when API key is missing (avoids log spam). */
  static keyMissingLogged = false;

  /**
   * Get web search results from Brave Web Search API.
   * Returns [] when BRAVE_SEARCH_API_KEY is missing/empty or on any error.
   */
  async webSearch(
    query: string,
    options: BraveSearchOptions = {}
  ): Promise<BraveSearchResult[]> {
    const apiKey = getEnvVar("BRAVE_SEARCH_API_KEY");
    if (!apiKey || apiKey.trim() === "") {
      if (!BraveSearchService.keyMissingLogged) {
        BraveSearchService.keyMissingLogged = true;
        log.debug(
          "Brave Search disabled: BRAVE_SEARCH_API_KEY not set. Add to .env.local to enable web search in workspace.",
          "BraveSearchService"
        );
      }
      return [];
    }

    const trimmed = query.trim();
    if (!trimmed) {
      return [];
    }

    const { country = "us", count = 5 } = options;
    const params = new URLSearchParams({
      q: trimmed,
      country: country.toLowerCase(),
      count: String(Math.min(Math.max(1, count), 20)),
    });
    const url = `${BRAVE_WEB_SEARCH_URL}?${params.toString()}`;

    try {
      const res = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "gzip",
          "X-Subscription-Token": apiKey,
        },
      });

      if (!res.ok) {
        const body = await res.text();
        log.debug(
          `Brave Search API error: ${res.status} ${res.statusText}${body ? ` — ${body.slice(0, 200)}` : ""}`,
          "BraveSearchService"
        );
        return [];
      }

      const data = (await res.json()) as BraveWebSearchResponse;
      const results = data?.web?.results ?? [];
      return results
        .filter(
          (r): r is { title: string; url: string; description: string } =>
            typeof r?.title === "string" &&
            typeof r?.url === "string" &&
            typeof r?.description === "string"
        )
        .map((r) => ({
          title: r.title,
          url: r.url,
          description: r.description,
        }));
    } catch (err) {
      log.debug(
        `Brave Search request failed: ${err instanceof Error ? err.message : String(err)}`,
        "BraveSearchService"
      );
      return [];
    }
  }
}
