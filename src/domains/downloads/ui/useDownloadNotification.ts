import { useEffect } from "react";
import { useDownloadContext } from "./DownloadContext";

/**
 * Hook to listen for download IPC events from the main process.
 * Should be called once at the app root level.
 */
export const useDownloadNotification = () => {
  const { addDownload, updateProgress, markCompleted, markFailed } =
    useDownloadContext();

  useEffect(() => {
    const unsubStarted = window.electronAPI.onDownloadStarted(
      (data: {
        id: string;
        fileName: string;
        url: string;
        totalBytes: number;
        savePath: string;
      }) => {
        addDownload(data.id, data.fileName, data.url, data.totalBytes, data.savePath);
      }
    );

    const unsubProgress = window.electronAPI.onDownloadProgress(
      (data: { id: string; receivedBytes: number; totalBytes: number }) => {
        updateProgress(data.id, data.receivedBytes, data.totalBytes);
      }
    );

    const unsubCompleted = window.electronAPI.onDownloadCompleted(
      (data: { id: string; savePath: string; fileName: string }) => {
        markCompleted(data.id, data.savePath);
      }
    );

    const unsubFailed = window.electronAPI.onDownloadFailed(
      (data: { id: string }) => {
        markFailed(data.id);
      }
    );

    return () => {
      unsubStarted();
      unsubProgress();
      unsubCompleted();
      unsubFailed();
    };
  }, [addDownload, updateProgress, markCompleted, markFailed]);
};
