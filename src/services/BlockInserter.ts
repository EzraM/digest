import { insertOrUpdateBlock } from "@blocknote/core";
import { log } from "../utils/rendererLogger";

// Block creation request interface (matches the one from ResponseExploder)
export interface BlockCreationRequest {
  type: string;
  props?: Record<string, any>;
  content?: any;
  position?: "after" | "before" | "replace";
}

/**
 * Service responsible for inserting blocks into the BlockNote editor
 * This handles the renderer-side block creation from block creation requests
 */
export class BlockInserter {
  private editor: any;

  constructor(editor: any) {
    this.editor = editor;
  }

  /**
   * Insert multiple blocks into the editor
   */
  async insertBlocks(
    blocks: BlockCreationRequest[],
    options: {
      staggerDelay?: number; // Delay between block insertions
      replaceCurrentBlock?: boolean; // Whether to replace the current block
    } = {}
  ): Promise<void> {
    const { staggerDelay = 100, replaceCurrentBlock = false } = options;

    log.debug(`Inserting ${blocks.length} blocks into editor`, "BlockInserter");

    try {
      for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i];

        // Add delay between insertions for better UX
        if (i > 0 && staggerDelay > 0) {
          await new Promise((resolve) => setTimeout(resolve, staggerDelay));
        }

        await this.insertSingleBlock(block, {
          isFirst: i === 0,
          replaceCurrentBlock: replaceCurrentBlock && i === 0,
        });
      }

      log.debug(
        `Successfully inserted ${blocks.length} blocks`,
        "BlockInserter"
      );
    } catch (error) {
      log.debug(`Error inserting blocks: ${error}`, "BlockInserter");
      throw error;
    }
  }

  /**
   * Insert a single block into the editor
   */
  private async insertSingleBlock(
    blockRequest: BlockCreationRequest,
    options: {
      isFirst: boolean;
      replaceCurrentBlock: boolean;
    }
  ): Promise<void> {
    const { type, props = {}, content } = blockRequest;
    const { isFirst, replaceCurrentBlock } = options;

    try {
      // Create the block data
      const blockData: any = {
        type,
        props,
      };

      // Add content if provided
      if (content !== undefined) {
        blockData.content = content;
      }

      log.debug(
        `Inserting block: ${JSON.stringify(blockData)}`,
        "BlockInserter"
      );

      // Use BlockNote's insertOrUpdateBlock function
      if (replaceCurrentBlock && isFirst) {
        // Replace the current block (useful for replacing an empty site block)
        const currentBlock = this.editor.getTextCursorPosition().block;
        this.editor.updateBlock(currentBlock, blockData);
      } else {
        // Insert a new block
        insertOrUpdateBlock(this.editor, blockData);
      }
    } catch (error) {
      log.debug(
        `Error inserting single block ${type}: ${error}`,
        "BlockInserter"
      );
      throw error;
    }
  }

  /**
   * Create a simple site block (for backward compatibility)
   */
  async insertSiteBlock(url: string): Promise<void> {
    await this.insertBlocks([
      {
        type: "site",
        props: { url },
      },
    ]);
  }

  /**
   * Create multiple site blocks from URLs
   */
  async insertSiteBlocks(urls: string[]): Promise<void> {
    const blocks = urls.map((url) => ({
      type: "site",
      props: { url },
    }));

    await this.insertBlocks(blocks, { staggerDelay: 150 });
  }
}
