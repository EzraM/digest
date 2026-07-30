import { NotebookPageSource } from "./NotebookPageSource";

export type PortableBlock = {
  id: string;
  type: string;
  props?: Record<string, unknown>;
  content?: unknown;
  children?: PortableBlock[];
};

export type ResolvedPageBreadcrumb = {
  notebookTitle: string;
  headingPath: Array<{
    blockId: string;
    level: number;
    text: string;
  }>;
  linkLabel: string | null;
  sourceExists: boolean;
};

const inlineText = (content: unknown): string => {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((item) => {
    if (!item || typeof item !== "object") return "";
    const value = item as { text?: unknown; content?: unknown };
    if (typeof value.text === "string") return value.text;
    return inlineText(value.content);
  }).join("");
};

const matchingLinkLabel = (content: unknown, href: string): string | null => {
  if (!Array.isArray(content)) return null;
  for (const item of content) {
    if (!item || typeof item !== "object") continue;
    const value = item as { type?: unknown; href?: unknown; content?: unknown };
    if (value.type === "link" && value.href === href) {
      const label = inlineText(value.content).trim();
      if (label) return label;
    }
    const nested = matchingLinkLabel(value.content, href);
    if (nested) return nested;
  }
  return null;
};

const flattenBlocks = (blocks: readonly PortableBlock[]): PortableBlock[] =>
  blocks.flatMap((block) => [
    block,
    ...flattenBlocks(Array.isArray(block.children) ? block.children : []),
  ]);

export function resolvePageBreadcrumb(
  documentTitle: string | null | undefined,
  blocks: readonly PortableBlock[],
  source: NotebookPageSource,
  sourceUrl: string
): ResolvedPageBreadcrumb {
  const ordered = flattenBlocks(blocks);
  const sourceIndex = ordered.findIndex((block) => block.id === source.blockId);
  const headingPath: ResolvedPageBreadcrumb["headingPath"] = [];

  if (sourceIndex >= 0) {
    for (const block of ordered.slice(0, sourceIndex)) {
      if (block.type !== "heading") continue;
      const text = inlineText(block.content).replace(/\s+/g, " ").trim();
      if (!text) continue;
      const rawLevel = block.props?.level;
      const level = typeof rawLevel === "number" ? rawLevel : 1;
      while (
        headingPath.length > 0 &&
        headingPath[headingPath.length - 1].level >= level
      ) {
        headingPath.pop();
      }
      headingPath.push({ blockId: block.id, level, text });
    }
  }

  const sourceBlock = sourceIndex >= 0 ? ordered[sourceIndex] : null;
  const currentLabel = sourceBlock
    ? matchingLinkLabel(sourceBlock.content, sourceUrl)
      ?? (sourceBlock.type === "site"
        ? (typeof sourceBlock.props?.title === "string" ? sourceBlock.props.title.trim() : "")
          || source.fallbackLinkLabel
          || (typeof sourceBlock.props?.url === "string" ? sourceBlock.props.url.trim() : "")
        : null)
    : null;

  return {
    notebookTitle: documentTitle?.trim() || "Untitled",
    headingPath,
    linkLabel: currentLabel || source.fallbackLinkLabel || null,
    sourceExists: sourceBlock !== null,
  };
}
