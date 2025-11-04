export interface SlashCommandOption {
  badge?: string;
  key: string;
  title: string;
  subtext?: string;
  aliases?: string[];
  group: string;
}

export type SlashCommandLoadingState =
  | "loading-initial"
  | "loading"
  | "loaded";

export interface SlashCommandResultsPayload {
  query: string;
  items: SlashCommandOption[];
  selectedIndex: number | null;
  loadingState?: SlashCommandLoadingState;
}
