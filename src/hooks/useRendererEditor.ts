import { useEffect } from "react";
import { insertOrUpdateBlock } from "@blocknote/core";
import { useCreateBlockNote } from "@blocknote/react";
import {
  CustomBlockNoteEditor,
  CustomPartialBlock,
  schema,
} from "../types/schema";
import { useBrowserScrollForward } from "./useBrowserScrollForward";
import { useDocumentSync } from "./useDocumentSync";
import { handleElectronPaste } from "../clipboard/handleElectronPaste";

let currentEditor: CustomBlockNoteEditor | null = null;
let onBlockCreatedCallback: ((blockId: string) => void) | null = null;

const createNewBrowserBlock = (url: string, sourceBlockId?: string): void => {
  if (!currentEditor) {
    return;
  }

  // If sourceBlockId is provided, insert after that block
  if (sourceBlockId) {
    const sourceBlock = currentEditor.getBlock(sourceBlockId);
    if (sourceBlock) {
      // Insert the new block after the source block
      // insertBlocks returns the inserted blocks array
      const insertedBlocks = currentEditor.insertBlocks(
        [
          {
            type: "site",
            props: { url },
          } as unknown as CustomPartialBlock,
        ],
        sourceBlock,
        "after"
      );

      // Get block ID from return value and trigger notification
      const newBlockId = insertedBlocks[0]?.id;
      if (newBlockId && onBlockCreatedCallback) {
        onBlockCreatedCallback(newBlockId);
      }
      return;
    }
  }

  // Fallback to default insertion if no source block or source block not found
  insertOrUpdateBlock(currentEditor, {
    type: "site",
    props: { url },
  } as unknown as CustomPartialBlock);

  // For fallback case, we need to find the block by URL match
  // Query all blocks to find the one we just inserted
  setTimeout(() => {
    if (!currentEditor || !onBlockCreatedCallback) return;

    const allBlocks = currentEditor.document;
    const findBlockRecursive = (
      blocks: typeof allBlocks
    ): (typeof allBlocks)[number] | null => {
      for (const block of blocks) {
        if (block.type === "site" && block.props?.url === url) {
          // Check if this is likely the newly inserted block
          // (we could improve this by tracking insertion time, but this is simpler)
          return block;
        }
        if (block.children) {
          const found = findBlockRecursive(block.children);
          if (found) return found;
        }
      }
      return null;
    };

    const foundBlock = findBlockRecursive(allBlocks);
    if (foundBlock?.id && onBlockCreatedCallback) {
      onBlockCreatedCallback(foundBlock.id);
    }
  }, 100); // Small delay to ensure block is inserted
};

export const useRendererEditor = (
  onBlockCreated?: (blockId: string) => void
): CustomBlockNoteEditor => {
  const editor = useCreateBlockNote({
    schema,
    initialContent: undefined,
    pasteHandler: (context) => handleElectronPaste(context),
  }) as CustomBlockNoteEditor;

  useEffect(() => {
    currentEditor = editor;
    return () => {
      currentEditor = null;
    };
  }, [editor]);

  useEffect(() => {
    // Set the callback for block creation notifications
    onBlockCreatedCallback = onBlockCreated || null;
    return () => {
      onBlockCreatedCallback = null;
    };
  }, [onBlockCreated]);

  useEffect(() => {
    if (!window.electronAPI?.onNewBrowserBlock) {
      return;
    }

    const unsubscribe = window.electronAPI.onNewBrowserBlock((data) => {
      if (data?.url) {
        createNewBrowserBlock(data.url, data.sourceBlockId);
      }
    });

    return unsubscribe;
  }, []);

  useBrowserScrollForward();
  useDocumentSync(editor);

  return editor;
};
