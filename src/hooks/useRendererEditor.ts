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

const createNewBrowserBlock = (url: string, sourceBlockId?: string): void => {
  if (!currentEditor) {
    return;
  }

  // If sourceBlockId is provided, insert after that block
  if (sourceBlockId) {
    const sourceBlock = currentEditor.getBlock(sourceBlockId);
    if (sourceBlock) {
      // Insert the new block after the source block
      currentEditor.insertBlocks(
        [
          {
            type: "site",
            props: { url },
          } as unknown as CustomPartialBlock,
        ],
        sourceBlock,
        "after"
      );
      return;
    }
  }

  // Fallback to default insertion if no source block or source block not found
  insertOrUpdateBlock(currentEditor, {
    type: "site",
    props: { url },
  } as unknown as CustomPartialBlock);
};

export const useRendererEditor = (): CustomBlockNoteEditor => {
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
