export type NotebookPageSource = {
  documentId: string;
  blockId: string;
  fallbackLinkLabel?: string;
};

export const MAX_FALLBACK_LINK_LABEL_LENGTH = 240;

export function boundedFallbackLinkLabel(label: string): string | undefined {
  const normalized = label.replace(/\s+/g, " ").trim();
  if (!normalized) return undefined;
  return normalized.slice(0, MAX_FALLBACK_LINK_LABEL_LENGTH);
}
