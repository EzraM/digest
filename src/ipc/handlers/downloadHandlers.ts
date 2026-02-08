import { IPCHandlerMap } from "../IPCRouter";
import { DownloadManager } from "../../services/DownloadManager";
import { log } from "../../utils/mainLogger";

export function createDownloadHandlers(
  downloadManager: DownloadManager
): IPCHandlerMap {
  return {
    "download:show-in-folder": {
      type: "on",
      fn: (_event, filePath: string) => {
        log.debug(`Showing download in folder: ${filePath}`, "main");
        downloadManager.showInFolder(filePath);
      },
    },
    "download:cancel": {
      type: "on",
      fn: (_event, downloadId: string) => {
        log.debug(`Cancelling download: ${downloadId}`, "main");
        downloadManager.cancel(downloadId);
      },
    },
  };
}
