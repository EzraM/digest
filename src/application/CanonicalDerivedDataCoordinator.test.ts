import { CanonicalDerivedDataCoordinator } from "./CanonicalDerivedDataCoordinator";

const document = (includeImage: boolean) => ({
  type: "doc",
  content: [{
    type: "blockGroup",
    content: [{
      type: "blockContainer",
      attrs: { id: "text" },
      content: [{ type: "paragraph", content: [{ type: "text", text: "Hello" }] }],
    }, ...(includeImage ? [{
      type: "blockContainer",
      attrs: { id: "image" },
      content: [{ type: "image", attrs: { url: "digest-image://image-1" } }],
    }] : [])],
  }],
});

describe("CanonicalDerivedDataCoordinator", () => {
  it("reindexes canonical blocks and deletes removed images", async () => {
    const reindexed: Array<{ documentId: string; blocks: unknown[] }> = [];
    const deleted: string[] = [];
    const coordinator = new CanonicalDerivedDataCoordinator({
      reindexDocument: async (documentId, blocks) => {
        reindexed.push({ documentId, blocks });
      },
      deleteImage: (imageId) => {
        deleted.push(imageId);
        return true;
      },
      debounceMs: 60_000,
    });

    coordinator.seed({
      documentId: "doc",
      prosemirrorJson: document(true),
    });
    await coordinator.flush("doc");
    expect(deleted).toEqual([]);

    coordinator.schedule({
      documentId: "doc",
      prosemirrorJson: document(false),
    });
    await coordinator.flush("doc");
    expect(deleted).toEqual(["image-1"]);
    expect(reindexed.length).toBe(2);
    expect(reindexed[1].documentId).toBe("doc");
    coordinator.dispose();
  });
});
