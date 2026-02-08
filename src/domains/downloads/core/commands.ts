import { DownloadAction } from "./types";

export function started(
  id: string,
  fileName: string,
  url: string,
  totalBytes: number,
  savePath: string
): DownloadAction {
  return { type: "STARTED", id, fileName, url, totalBytes, savePath };
}

export function progress(
  id: string,
  receivedBytes: number,
  totalBytes: number
): DownloadAction {
  return { type: "PROGRESS", id, receivedBytes, totalBytes };
}

export function completed(id: string, savePath: string): DownloadAction {
  return { type: "COMPLETED", id, savePath };
}

export function failed(id: string): DownloadAction {
  return { type: "FAILED", id };
}

export function dismiss(id: string): DownloadAction {
  return { type: "DISMISS", id };
}

export function dismissAll(): DownloadAction {
  return { type: "DISMISS_ALL" };
}
