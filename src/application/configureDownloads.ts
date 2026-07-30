import { WebContentsView } from "electron";
import { DownloadManager } from "../services/DownloadManager";

const DOWNLOAD_EVENTS = {
  STARTED: "download:started",
  PROGRESS: "download:progress",
  COMPLETED: "download:completed",
  FAILED: "download:failed",
} as const;

export const configureDownloads = (
  downloadManager: DownloadManager,
  getRendererView: () => WebContentsView | null
) => {
  const send = (channel: string, payload: unknown) => {
    const rendererView = getRendererView();
    if (rendererView && !rendererView.webContents.isDestroyed()) {
      rendererView.webContents.send(channel, payload);
    }
  };

  downloadManager.recoverFromCrash();
  downloadManager.setOnStarted((info) => {
    send(DOWNLOAD_EVENTS.STARTED, {
      id: info.id,
      fileName: info.fileName,
      url: info.url,
      totalBytes: info.totalBytes,
      savePath: info.savePath,
    });
  });
  downloadManager.setOnProgress((info) => {
    send(DOWNLOAD_EVENTS.PROGRESS, {
      id: info.id,
      receivedBytes: info.receivedBytes,
      totalBytes: info.totalBytes,
    });
  });
  downloadManager.setOnCompleted((info) => {
    send(DOWNLOAD_EVENTS.COMPLETED, {
      id: info.id,
      savePath: info.savePath,
      fileName: info.fileName,
    });
    send("download:insert-file-block", {
      id: info.id,
      fileName: info.fileName,
      savePath: info.savePath,
      url: info.url,
    });
  });
  downloadManager.setOnFailed((info) => {
    send(DOWNLOAD_EVENTS.FAILED, {
      id: info.id,
      status: info.status,
    });
  });
};
