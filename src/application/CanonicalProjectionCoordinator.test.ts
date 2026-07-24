import type { Block } from "../domains/blocks/core";
import { CanonicalProjectionCoordinator } from "./CanonicalProjectionCoordinator";
import { countProjectedBlocks } from "./projectCanonicalDocument";

const block = (id: string, imageId?: string): Block => ({
  id,
  type: imageId ? "image" : "paragraph",
  props: imageId ? { url: `digest-image://${imageId}` } : {},
  content: [],
  children: [],
});

describe("CanonicalProjectionCoordinator", () => {
  it("reindexes canonical blocks, updates counts, and deletes removed images", async () => {
    const reindexed: Array<{ documentId: string; blocks: Block[] }> = [];
    const counts: number[] = [];
    const deleted: string[] = [];
    const coordinator = new CanonicalProjectionCoordinator({
      reindexDocument: async (documentId, blocks) => {
        reindexed.push({ documentId, blocks });
      },
      extractImageIds: (blocks) =>
        new Set(
          blocks.flatMap((item) =>
            typeof item.props?.url === "string"
              ? [item.props.url.replace("digest-image://", "")]
              : []
          )
        ),
      deleteImage: (imageId) => {
        deleted.push(imageId);
        return true;
      },
      updateBlockCount: (_documentId, count) => counts.push(count),
      countBlocks: countProjectedBlocks,
      debounceMs: 60_000,
    });

    coordinator.seed({
      documentId: "doc",
      blocks: [block("text"), block("image", "image-1")],
    });
    await coordinator.flush("doc");
    expect(deleted).toEqual([]);
    expect(counts).toEqual([2]);

    coordinator.schedule({
      documentId: "doc",
      blocks: [block("text")],
    });
    await coordinator.flush("doc");
    expect(deleted).toEqual(["image-1"]);
    expect(reindexed.length).toBe(2);
    expect(reindexed[1].documentId).toBe("doc");
    coordinator.dispose();
  });
});
