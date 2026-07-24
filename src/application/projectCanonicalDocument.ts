import type { Block } from "../domains/blocks/core";

type ProseMirrorNode = {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: ProseMirrorNode[];
  marks?: Array<{ type?: string; attrs?: Record<string, unknown> }>;
  text?: string;
};

const projectInlineContent = (
  nodes: ProseMirrorNode[] | undefined
): unknown[] =>
  (nodes ?? []).map((node) => {
    if (node.type === "text") {
      const styles: Record<string, unknown> = {};
      let href: string | undefined;
      for (const mark of node.marks ?? []) {
        if (mark.type === "link" && typeof mark.attrs?.href === "string") {
          href = mark.attrs.href;
        } else if (mark.type) {
          styles[mark.type] = mark.attrs ?? true;
        }
      }
      const text = {
        type: "text",
        text: node.text ?? "",
        styles,
      };
      return href
        ? { type: "link", href, content: [text] }
        : text;
    }
    if (node.type === "hardBreak") {
      return { type: "text", text: "\n", styles: {} };
    }
    return {
      type: node.type ?? "unknown",
      props: node.attrs ?? {},
      content: projectInlineContent(node.content),
    };
  });

const projectBlockContainer = (container: ProseMirrorNode): Block | null => {
  if (container.type !== "blockContainer") return null;
  const blockContent = container.content?.find(
    (node) => node.type !== "blockGroup"
  );
  if (!blockContent?.type || typeof container.attrs?.id !== "string") {
    return null;
  }
  const childGroup = container.content?.find(
    (node) => node.type === "blockGroup"
  );
  const children = (childGroup?.content ?? [])
    .map(projectBlockContainer)
    .filter((block): block is Block => block !== null);

  return {
    id: container.attrs.id,
    type: blockContent.type,
    props: blockContent.attrs ?? {},
    content: projectInlineContent(blockContent.content),
    children,
  };
};

export const projectCanonicalDocument = (
  prosemirrorJson: ProseMirrorNode
): Block[] => {
  const rootGroup = prosemirrorJson.content?.find(
    (node) => node.type === "blockGroup"
  );
  return (rootGroup?.content ?? [])
    .map(projectBlockContainer)
    .filter((block): block is Block => block !== null);
};

export const countProjectedBlocks = (blocks: readonly Block[]): number =>
  blocks.reduce(
    (count, block) =>
      count + 1 + countProjectedBlocks(block.children ?? []),
    0
  );
