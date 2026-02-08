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

export const getCurrentEditor = (): CustomBlockNoteEditor | null =>
  currentEditor;

export const getCurrentCursorBlockId = (): string | null => {
  try {
    const block = currentEditor?.getTextCursorPosition?.().block;
    return block?.id ?? null;
  } catch {
    return null;
  }
};

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
    uploadFile: async (file: File): Promise<string> => {
      // Read file as ArrayBuffer
      const arrayBuffer = await file.arrayBuffer();

      // Get image dimensions if it's an image
      let width: number | undefined;
      let height: number | undefined;

      if (file.type.startsWith("image/")) {
        try {
          const img = new Image();
          const objectUrl = URL.createObjectURL(file);
          await new Promise((resolve, reject) => {
            img.onload = () => {
              width = img.naturalWidth;
              height = img.naturalHeight;
              URL.revokeObjectURL(objectUrl);
              resolve(null);
            };
            img.onerror = reject;
            img.src = objectUrl;
          });
        } catch {
          // If we can't get dimensions, continue without them
        }
      }

      // Get active document ID (optional, for cleanup later)
      let documentId: string | undefined;
      try {
        const activeDoc = await window.electronAPI?.documents?.getActive();
        documentId = activeDoc?.id;
      } catch {
        // If we can't get document ID, continue without it
      }

      // Save image via IPC
      if (!window.electronAPI?.image?.saveImage) {
        throw new Error("Image API not available");
      }

      const result = await window.electronAPI.image.saveImage({
        arrayBuffer,
        mimeType: file.type,
        fileName: file.name,
        width,
        height,
        documentId,
      });

      return result.url;
    },
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
      return () => {}; // Return empty cleanup function
    }

    const unsubscribe = window.electronAPI.onNewBrowserBlock((data) => {
      if (data?.url) {
        createNewBrowserBlock(data.url, data.sourceBlockId);
      }
    });

    return unsubscribe;
  }, []);

  // Handle inline link insertion from cmd+click in page context
  useEffect(() => {
    if (!window.electronAPI?.onInsertLink) {
      console.warn("[useRendererEditor] onInsertLink API not available");
      return () => {}; // Return empty cleanup function
    }

    console.log("[useRendererEditor] Registering onInsertLink handler");

    const unsubscribe = window.electronAPI.onInsertLink((data) => {
      console.log("[useRendererEditor] onInsertLink event received:", data);

      if (!currentEditor) {
        console.warn("[useRendererEditor] No currentEditor available");
        return;
      }

      if (!data?.url || !data?.title) {
        console.warn("[useRendererEditor] Invalid data - missing url or title:", data);
        return;
      }

      try {
        // Get current cursor position
        const cursorPosition = currentEditor.getTextCursorPosition();
        console.log("[useRendererEditor] Current cursor position:", cursorPosition);

        if (!cursorPosition) {
          console.warn("[useRendererEditor] No cursor position available for link insertion");
          return;
        }

        console.log("[useRendererEditor] Inserting link block after current block");

        // Insert a paragraph with the link at the cursor position
        // We insert after the current block
        // BlockNote link format: { type: "link", href: string, content: [{ type: "text", text: string }] }
        currentEditor.insertBlocks(
          [
            {
              type: "paragraph",
              content: [
                {
                  type: "link",
                  href: data.url,
                  content: [
                    {
                      type: "text",
                      text: data.title,
                      styles: {},
                    },
                  ],
                },
              ],
            } as any,
          ],
          cursorPosition.block,
          "after"
        );

        console.log("[useRendererEditor] Link block inserted successfully");
        console.log(`[useRendererEditor] ✓ Link captured: "${data.title}" → ${data.url}`);
      } catch (error) {
        console.error("[useRendererEditor] Failed to insert inline link:", error);
      }
    });

    return unsubscribe;
  }, []);

  // Handle file block insertion when a download completes
  useEffect(() => {
    if (!window.electronAPI?.onDownloadInsertFileBlock) {
      return () => {};
    }

    const unsubscribe = window.electronAPI.onDownloadInsertFileBlock((data) => {
      if (!currentEditor) return;

      try {
        const cursorPosition = currentEditor.getTextCursorPosition();
        if (!cursorPosition) return;

        currentEditor.insertBlocks(
          [
            {
              type: "file",
              props: {
                name: data.fileName,
                url: data.url,
              },
            } as any,
          ],
          cursorPosition.block,
          "after"
        );
      } catch (error) {
        console.error("[useRendererEditor] Failed to insert file block:", error);
      }
    });

    return unsubscribe;
  }, []);

  // Handle scroll position updates from main process
  useEffect(() => {
    if (!window.electronAPI?.onBrowserScrollPercent || !currentEditor) {
      return () => {}; // Return empty cleanup function
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
