import { useEffect, useMemo } from "react";
import { useCreateBlockNote } from "@blocknote/react";
// TypeScript's legacy "node" resolution does not follow this package export,
// while Vite and Electron resolve it correctly at runtime.
// @ts-expect-error BlockNote publishes types through the package export map.
// eslint-disable-next-line import/no-unresolved
import { withCollaboration } from "@blocknote/core/yjs";
import * as Y from "yjs";
import {
  CustomBlockNoteEditor,
  schema,
} from "../types/schema";
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
import { createLiveLinkIndicatorExtension } from "../domains/blocks/adapters/createLiveLinkIndicatorExtension";
import { createFocusedBlockExtension } from "../domains/blocks/adapters/createFocusedBlockExtension";
import { useAppRoute } from "../context/AppRouteContext";
import { boundedFallbackLinkLabel } from "../domains/page-context/NotebookPageSource";

export const useRendererEditor = (
  pluginProfile?: {
    profileId: string;
    documentId: string | null;
    settings?: ProfileSettings | null;
  }
): CustomBlockNoteEditor => {
  const { navigateToUrl } = useAppRoute();
  const documentId = pluginProfile?.documentId ?? null;
  const yDoc = useMemo(() => new Y.Doc(), [documentId]);
  useEffect(() => () => yDoc.destroy(), [yDoc]);

  const editor = useCreateBlockNote(withCollaboration({
    schema,
    collaboration: {
      fragment: yDoc.getXmlFragment("document"),
      user: {
        name: "Local user",
        color: "#6d5bd0",
      },
    },
    links: {
      HTMLAttributes: {
        target: "_self",
      },
      onClick: (event: MouseEvent) => {
        event.preventDefault();

        const target = event.target;
        const element =
          target instanceof Element
            ? target
            : target instanceof Node
              ? target.parentElement
              : null;
        const link = element?.closest<HTMLAnchorElement>(
          'a[data-inline-content-type="link"]'
        );
        if (!link) return false;

        const sourceBlockId = link
          .closest<HTMLElement>('[data-node-type="blockOuter"][data-id]')
          ?.getAttribute("data-id");
        navigateToUrl(
          link.href,
          documentId && sourceBlockId
            ? {
                documentId,
                blockId: sourceBlockId,
                fallbackLinkLabel: boundedFallbackLinkLabel(link.textContent ?? ""),
              }
            : undefined
        );
        return true;
      },
    },
    extensions: [
      createMiddleClickDeleteExtension,
      createLiveLinkIndicatorExtension,
      createFocusedBlockExtension,
    ],
    pasteHandler: (context: Parameters<typeof handleElectronPaste>[0]) =>
      handleElectronPaste(context),
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
  }), [documentId]) as CustomBlockNoteEditor;
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

  useDocumentSync(editor, documentId, yDoc);

  return editor;
};
