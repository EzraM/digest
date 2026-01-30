import { ClipDraft } from "../core/types";
import { CustomPartialBlock } from "../../../types/schema";
import { BlockOperation } from "../../../types/operations";
import { log } from "../../../utils/rendererLogger";
import { createClipReferenceInlineContent } from "../../../utils/clipInlineContent";

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

    const baseBlockId = `clip-${draft.id}`;
    let blockCounter = 0;

    const assignIds = (block: CustomPartialBlock): CustomPartialBlock => {
      const id = (block as any).id || `${baseBlockId}-block-${blockCounter++}`;
      const withId = { ...(block as any), id } as CustomPartialBlock;

      if (Array.isArray((block as any).children)) {
        (withId as any).children = (block as any).children.map(
          (child: CustomPartialBlock) => assignIds(child)
        );
      }

      return withId;
    };

    const blocksToInsert: CustomPartialBlock[] = [
      ...(draft.proposedBlocks as CustomPartialBlock[]),
    ];

    if (draft.sourceUrl || draft.sourceTitle) {
      blocksToInsert.push({
        type: "paragraph",
        content: createClipReferenceInlineContent(
          draft.sourceUrl,
          draft.sourceTitle
        ),
      } as CustomPartialBlock);
    }

    const operations: BlockOperation[] = [];
    let afterBlockId = insertAfterBlockId;

    for (const block of blocksToInsert) {
      const blockWithId = assignIds(block);
      operations.push({
        type: "insert",
        blockId: (blockWithId as any).id,
        block: blockWithId as any,
        afterBlockId,
        source: "clip",
        timestamp: Date.now(),
      });
      afterBlockId = (blockWithId as any).id;
    }

    // Create transaction origin
    // Use "clip" source so renderer applies the update (not skipped like "user" source)
    const origin = {
      source: "clip" as const,
      timestamp: Date.now(),
      batchId: `clip-${draft.id}-${Date.now()}`,
      metadata: {
        clipId: draft.id,
        sourceUrl: draft.sourceUrl,
        blockCount: operations.length,
      },
    };

    log.debug(
      `Created ${operations.length} operations for clip draft ${draft.id}`,
      "ClipCommitService"
    );

    return { operations, origin };
  }
}
