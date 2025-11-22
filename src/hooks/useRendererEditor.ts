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

const createNewBrowserBlock = (url: string): void => {
  if (!currentEditor) {
    return;
  }

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
        createNewBrowserBlock(data.url);
      }
    });

    return unsubscribe;
  }, []);

  useBrowserScrollForward();
  useDocumentSync(editor);

  return editor;
};
