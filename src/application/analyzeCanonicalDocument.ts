import type { Block } from "../domains/blocks/core";
import { assetAddress } from "../domains/assets/core/AssetAddress";

export type ProseMirrorJsonNode = {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: ProseMirrorJsonNode[];
  marks?: Array<{ type?: string; attrs?: Record<string, unknown> }>;
  text?: string;
};

export type CanonicalDocumentAnalysis = {
  searchBlocks: Block[];
  assetIds: Set<string>;
};

const collectText = (node: ProseMirrorJsonNode): string => {
  if (node.type === "text") return node.text ?? "";
  if (node.type === "hardBreak") return "\n";
  return (node.content ?? []).map(collectText).join("");
};

const collectAssetIds = (value: unknown, assetIds: Set<string>): void => {
  if (typeof value === "string") {
    const id = assetAddress.parse(value);
    if (id) assetIds.add(id);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectAssetIds(item, assetIds);
    return;
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) {
      collectAssetIds(item, assetIds);
    }
  }
};

const analyzeBlockContainer = (
  container: ProseMirrorJsonNode,
  assetIds: Set<string>
): Block | null => {
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
    .map((child) => analyzeBlockContainer(child, assetIds))
    .filter((block): block is Block => block !== null);
  const props = blockContent.attrs ?? {};
  collectAssetIds(props, assetIds);

  return {
    id: container.attrs.id,
    type: blockContent.type,
    props,
    // Search only needs textual content; marks and BlockNote inline JSON are
    // deliberately not reconstructed here.
    content: collectText(blockContent),
    children,
  };
};

export const analyzeCanonicalDocument = (
  prosemirrorJson: ProseMirrorJsonNode
): CanonicalDocumentAnalysis => {
  const assetIds = new Set<string>();
  const rootGroup = prosemirrorJson.content?.find(
    (node) => node.type === "blockGroup"
  );
  const searchBlocks = (rootGroup?.content ?? [])
    .map((container) => analyzeBlockContainer(container, assetIds))
    .filter((block): block is Block => block !== null);
  return { searchBlocks, assetIds };
};
