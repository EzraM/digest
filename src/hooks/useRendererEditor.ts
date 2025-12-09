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
  // insertOrUpdateBlock without a block ID inserts at the end automatically
  const newBlock = insertOrUpdateBlock(currentEditor, {
    type: "site",
    props: { url },
  } as unknown as CustomPartialBlock);

  // Get block ID from return value and trigger notification
  if (newBlock?.id && onBlockCreatedCallback) {
    onBlockCreatedCallback(newBlock.id);
  }
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

  // Handle scroll position updates from main process
  useEffect(() => {
    if (!window.electronAPI?.onBrowserScrollPercent || !currentEditor) {
      return;
    }

    const unsubscribe = window.electronAPI.onBrowserScrollPercent((data) => {
      const { blockId, scrollPercent } = data;
      if (!currentEditor) return;

      // Update the block props with the new scroll percent
      const block = currentEditor.getBlock(blockId);
      if (block && block.type === "site") {
        currentEditor.updateBlock(blockId, {
          type: "site",
          props: { ...block.props, scrollPercent },
        });
      }
    });

    return unsubscribe;
  }, []);

  useBrowserScrollForward();
  useDocumentSync(editor);

  return editor;
};
