import { useEffect } from "react";
import { useCreateBlockNote } from "@blocknote/react";
import {
  CustomBlockNoteEditor,
  CustomPartialBlock,
  schema,
} from "../types/schema";
import { useBrowserScrollForward } from "./useBrowserScrollForward";
import { useDocumentSync } from "./useDocumentSync";
import { handleElectronPaste } from "../clipboard/handleElectronPaste";
import { ProfileSettings } from "../types/documents";
import { PluginHost } from "../domains/notebook-plugins/application/PluginHost";
import { resolveProfilePlugins } from "../domains/notebook-plugins/application/resolveProfilePlugins";
import {
  NotebookBlockSnapshot,
  NotebookPluginOperation,
} from "../domains/notebook-plugins/core/types";
import { createMiddleClickDeleteExtension } from "../domains/blocks/adapters/createMiddleClickDeleteExtension";

let currentEditor: CustomBlockNoteEditor | null = null;

type PendingInlineLink = {
  url: string;
  title: string;
  sourceBlockId?: string;
};

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

const createInlineLinkBlock = (data: PendingInlineLink): CustomPartialBlock =>
  ({
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
  }) as unknown as CustomPartialBlock;

const insertInlineLinkBlock = (
  editor: CustomBlockNoteEditor,
  data: PendingInlineLink
): boolean => {
  const anchorBlock = data.sourceBlockId
    ? editor.getBlock(data.sourceBlockId)
    : editor.getTextCursorPosition()?.block;

  if (!anchorBlock) {
    console.warn("[useRendererEditor] No anchor block available for link insertion");
    return false;
  }

  editor.insertBlocks([createInlineLinkBlock(data)], anchorBlock, "after");

  return true;
};

export const insertInlineLinkAtCurrentCursor = (
  url: string,
  title: string
): boolean => {
  if (!currentEditor) {
    return false;
  }

  return insertInlineLinkBlock(currentEditor, {
    url,
    title: title.trim() || url,
  });
};

const isCurrentBlockRoute = (blockId: string): boolean => {
  const blockRouteMatch = window.location.hash.match(/^#\/block\/([^?/]*)/);
  return blockRouteMatch
    ? decodeURIComponent(blockRouteMatch[1]) === blockId
    : false;
};

export const useRendererEditor = (
  pluginProfile?: {
    profileId: string;
    documentId: string | null;
    settings?: ProfileSettings | null;
  }
): CustomBlockNoteEditor => {
  const editor = useCreateBlockNote({
    schema,
    initialContent: undefined,
    extensions: [createMiddleClickDeleteExtension],
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
    if (!pluginProfile) return;

    const host = new PluginHost();
    host.configure(
      pluginProfile.profileId,
      resolveProfilePlugins(pluginProfile.settings)
    );

    const snapshot = (): NotebookBlockSnapshot[] =>
      editor.document.map((block) => ({
        id: block.id,
        type: block.type,
        content: Array.isArray(block.content) ? (block.content as any) : null,
      }));

    const apply = (operations: NotebookPluginOperation[]) => {
      operations.forEach((operation) => {
        const block = editor.getBlock(operation.blockId);
        if (block && operation.type === "set-inline-content") {
          editor.updateBlock(block, { content: operation.content } as any);
        }
      });
    };

    const unsubscribe = editor.onChange(() => {
      void host.run(
        {
          profileId: pluginProfile.profileId,
          documentId: pluginProfile.documentId,
          transactionId: crypto.randomUUID(),
          source: "user",
          blocks: snapshot(),
        },
        apply
      );
    });

    return () => {
      unsubscribe?.();
      host.dispose();
    };
  }, [editor, pluginProfile?.profileId, pluginProfile?.documentId, pluginProfile?.settings]);

  useEffect(() => {
    currentEditor = editor;
    return () => {
      currentEditor = null;
    };
  }, [editor]);

  // Handle inline link insertion from cmd+click in page context
  useEffect(() => {
    if (!window.electronAPI?.onInsertLink) {
      console.warn("[useRendererEditor] onInsertLink API not available");
      return;
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
        if (data.sourceBlockId && isCurrentBlockRoute(data.sourceBlockId)) {
          console.log(
            `[useRendererEditor] Ignoring route inline link; back bar will insert the current page URL: "${data.title}" → ${data.url}`
          );
          return;
        }

        if (!insertInlineLinkBlock(currentEditor, data)) {
          return;
        }

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
      return;
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

  useBrowserScrollForward();
  useDocumentSync(editor);

  return editor;
};
