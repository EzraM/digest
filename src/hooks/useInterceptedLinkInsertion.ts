import { useEffect } from "react";
import { NotebookWriteClient } from "../domains/notebook-content/application/NotebookWriteClient";
import {
  afterNotebookBlock,
  NotebookAddress,
} from "../domains/notebook-content/core/NotebookAddress";
import { createInlineLinkBlock } from "./inlineLinkInsertion";

export const isBlockRouteHash = (
  hash: string,
  blockId: string
): boolean => {
  const match = hash.match(/^#\/block\/([^?/]*)/);
  return match ? decodeURIComponent(match[1]) === blockId : false;
};

export const useInterceptedLinkInsertion = (
  notebookAddress: NotebookAddress | null,
  notebookWriter: NotebookWriteClient
) => {
  useEffect(() => {
    if (!window.electronAPI?.onInsertLink) {
      console.warn("[useInterceptedLinkInsertion] API not available");
      return;
    }

    const unsubscribe = window.electronAPI.onInsertLink(async (data) => {
      if (!data?.url || !data?.title || !notebookAddress) return;

      if (
        data.sourceBlockId &&
        isBlockRouteHash(window.location.hash, data.sourceBlockId)
      ) {
        return;
      }

      const address = data.sourceBlockId
        ? afterNotebookBlock(
            notebookAddress.documentId,
            data.sourceBlockId
          )
        : notebookAddress;

      try {
        const result = await notebookWriter.insert(
          address,
          [
            createInlineLinkBlock({
              url: data.url,
              title: data.title,
              sourceBlockId: data.sourceBlockId,
            }),
          ],
          {
            source: "page-link",
            sourceUrl: data.url,
            capturedAt: Date.now(),
          }
        );

        if (result.status === "rejected") {
          console.warn("[useInterceptedLinkInsertion] Write rejected", result);
        }
      } catch (error) {
        console.error(
          "[useInterceptedLinkInsertion] Failed to insert link:",
          error
        );
      }
    });

    return unsubscribe;
  }, [notebookAddress, notebookWriter]);
};
