import { ClipDraft } from "../types/clip";
import { CustomPartialBlock } from "../types/schema";
import { BlockOperation } from "../types/operations";
import { log } from "../utils/rendererLogger";
import { createClipReferenceInlineContent } from "../utils/clipInlineContent";

/**
 * Service for committing clip drafts to the document
 * Converts proposed blocks to operations and inserts them
 */
export class ClipCommitService {
  private static instance: ClipCommitService;

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
    // BlockNote uses a children array, not parentId, so we include children directly
    const clipBlockId = `clip-${draft.id}`;

    // Create child blocks with proper IDs
    const children = draft.proposedBlocks.map((block, index) => ({
      ...(block as any),
      id: `${clipBlockId}-child-${index}`,
    })) as any[];

    const clipBlock = {
      id: clipBlockId,
      type: "clip",
      props: {
        sourceUrl: draft.sourceUrl,
        title: draft.sourceTitle,
      },
      content: createClipReferenceInlineContent(
        draft.sourceUrl,
        draft.sourceTitle
      ),
      children: children,
    } as CustomPartialBlock;

    // Create operation to insert the clip container with its children
    const operations: BlockOperation[] = [
      {
        type: "insert",
        blockId: clipBlockId,
        block: clipBlock as any,
        afterBlockId: insertAfterBlockId,
        source: "clip",
        timestamp: Date.now(),
      },
    ];

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
