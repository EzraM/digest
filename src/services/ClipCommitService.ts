import { ClipDraft } from "../types/clip";
import { CustomPartialBlock } from "../types/schema";
import { BlockOperation } from "../types/operations";
import { BlockNoteOperationConverter } from "./BlockNoteOperationConverter";
import { log } from "../utils/rendererLogger";
import { createClipReferenceInlineContent } from "../utils/clipInlineContent";

/**
 * Service for committing clip drafts to the document
 * Converts proposed blocks to operations and inserts them
 */
export class ClipCommitService {
  private static instance: ClipCommitService;
  private converter = BlockNoteOperationConverter.getInstance();

  public static getInstance(): ClipCommitService {
    if (!ClipCommitService.instance) {
      ClipCommitService.instance = new ClipCommitService();
    }
    return ClipCommitService.instance;
  }

  /**
   * Convert a clip draft to block operations for insertion
   */
  async createClipOperations(
    draft: ClipDraft,
    insertAfterBlockId?: string
  ): Promise<{ operations: BlockOperation[]; origin: any }> {
    log.debug(
      `Creating operations for clip draft ${draft.id}`,
      "ClipCommitService"
    );

    if (!draft.proposedBlocks || draft.proposedBlocks.length === 0) {
      throw new Error("No proposed blocks to insert");
    }

    // Create the clip container block with inline content for the reference URL
    const clipBlock = {
      type: "clip",
      props: {
        sourceUrl: draft.sourceUrl,
        title: draft.sourceTitle,
      },
      content: createClipReferenceInlineContent(
        draft.sourceUrl,
        draft.sourceTitle
      ),
    } as CustomPartialBlock;

    // Create operations to insert the clip container and its children
    const operations: BlockOperation[] = [];

    // First, insert the clip container
    const clipBlockId = `clip-${draft.id}`;
    operations.push({
      type: "insert",
      blockId: clipBlockId,
      block: clipBlock as any,
      position: 0, // Will be calculated based on insertAfterBlockId
      source: "clip",
      timestamp: Date.now(),
    });

    // Then insert children blocks as children of the clip container
    draft.proposedBlocks.forEach((block, index) => {
      const childBlockId = `${clipBlockId}-child-${index}`;
      operations.push({
        type: "insert",
        blockId: childBlockId,
        block: block as any,
        parentId: clipBlockId,
        position: index,
        source: "clip",
        timestamp: Date.now(),
      });
    });

    // Create transaction origin
    // Use "clip" source so renderer applies the update (not skipped like "user" source)
    const origin = {
      source: "clip" as const,
      timestamp: Date.now(),
      batchId: `clip-${draft.id}-${Date.now()}`,
      metadata: {
        clipId: draft.id,
        sourceUrl: draft.sourceUrl,
        blockCount: draft.proposedBlocks.length + 1,
      },
    };

    log.debug(
      `Created ${operations.length} operations for clip draft ${draft.id}`,
      "ClipCommitService"
    );

    return { operations, origin };
  }
}


