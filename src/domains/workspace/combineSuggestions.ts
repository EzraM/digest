/**
 * Combines slash commands, in-doc search results, and Brave web search results
 * into a single ranked list for the workspace UI.
 */

import type { SlashCommandOption } from "../../types/slashCommand";

/** Search result shape from FTS / SearchIndexManager */
export interface SearchResultPayload {
  blockId: string;
  documentId: string;
  blockType: string;
  content: string;
  score: number;
  metadata: Record<string, unknown>;
}

/** Web search result payload from Brave Search API */
export interface WebSearchPayload {
  title: string;
  url: string;
  description: string;
}

export type RankedWorkspaceItem =
  | { kind: "slash"; score: number; payload: SlashCommandOption }
  | { kind: "note"; score: number; payload: SearchResultPayload }
  | { kind: "suggest"; score: number; payload: WebSearchPayload };

const MAX_PER_SOURCE = 8;
const MAX_TOTAL = 24;

/**
 * Slash options are already filtered/sorted by match quality (best first).
 * Assign position-based score so best match is highest (1, 0.95, 0.9, ...).
 */
function slashToRanked(options: SlashCommandOption[]): RankedWorkspaceItem[] {
  return options.slice(0, MAX_PER_SOURCE).map((option, index) => ({
    kind: "slash" as const,
    score: Math.max(0, 1 - index * 0.05),
    payload: option,
  }));
}

/**
 * Notes have FTS score; normalize to [0, 1] by max in batch (or 1 if single).
 */
function notesToRanked(results: SearchResultPayload[]): RankedWorkspaceItem[] {
  if (results.length === 0) return [];
  const maxScore = Math.max(...results.map((r) => r.score), 1e-9);
  return results.slice(0, MAX_PER_SOURCE).map((r) => ({
    kind: "note" as const,
    score: r.score / maxScore,
    payload: r,
  }));
}

/**
 * Web search results: position-based score (first = 1, then decay).
 */
function webSearchToRanked(
  results: WebSearchPayload[]
): RankedWorkspaceItem[] {
  return results.slice(0, MAX_PER_SOURCE).map((result, index) => ({
    kind: "suggest" as const,
    score: Math.max(0, 1 - index * 0.1),
    payload: result,
  }));
}

/**
 * Merge slash, notes, and web search into one list sorted by score descending.
 * Tiebreaker: source order slash → note → suggest.
 */
export function combineAndRank(
  slashOptions: SlashCommandOption[],
  noteResults: SearchResultPayload[],
  webSearchResults: WebSearchPayload[]
): RankedWorkspaceItem[] {
  const slash = slashToRanked(slashOptions);
  const notes = notesToRanked(noteResults);
  const suggest = webSearchToRanked(webSearchResults);

  const combined = [...slash, ...notes, ...suggest].sort((a, b) => {
    const scoreDiff = b.score - a.score;
    if (scoreDiff !== 0) return scoreDiff;
    const order = { slash: 0, note: 1, suggest: 2 };
    return order[a.kind] - order[b.kind];
  });

  return combined.slice(0, MAX_TOTAL);
}
