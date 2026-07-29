import { useEffect, useRef } from "react";
import { NotebookWriteClient } from "../domains/notebook-content/application/NotebookWriteClient";
import { NotebookAddress } from "../domains/notebook-content/core/NotebookAddress";
import { CustomPartialBlock } from "../types/schema";

export const useDownloadNotebookInsertion = (
  notebookAddress: NotebookAddress | null,
  notebookWriter: NotebookWriteClient
) => {
  const addressesByDownloadId = useRef(new Map<string, NotebookAddress>());

  useEffect(() => {
    if (
      !window.electronAPI?.onDownloadStarted ||
      !window.electronAPI?.onDownloadInsertFileBlock
    ) {
      return;
    }

    const unsubscribeStarted = window.electronAPI.onDownloadStarted((data) => {
      if (notebookAddress) {
        addressesByDownloadId.current.set(data.id, notebookAddress);
      }
    });

    const unsubscribeCompleted =
      window.electronAPI.onDownloadInsertFileBlock(async (data) => {
        const address =
          addressesByDownloadId.current.get(data.id) ?? notebookAddress;
        addressesByDownloadId.current.delete(data.id);
        if (!address) return;

        try {
          const result = await notebookWriter.insert(
            address,
            [
              {
                type: "file",
                props: {
                  name: data.fileName,
                  url: data.url,
                },
              } as CustomPartialBlock,
            ],
            {
              source: "download",
              sourceUrl: data.url,
              capturedAt: Date.now(),
            }
          );

          if (result.status === "rejected") {
            console.warn("[useDownloadNotebookInsertion] Write rejected", result);
          }
        } catch (error) {
          console.error(
            "[useDownloadNotebookInsertion] Failed to insert file:",
            error
          );
        }
      });

    return () => {
      unsubscribeStarted();
      unsubscribeCompleted();
    };
  }, [notebookAddress, notebookWriter]);
};
