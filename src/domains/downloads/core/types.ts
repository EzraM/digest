/**
 * Download notification types
 * Used for showing download progress in the notebook UI
 */

export interface DownloadNotification {
  id: string;
  fileName: string;
  url: string;
  totalBytes: number;
  receivedBytes: number;
  status: "in_progress" | "completed" | "failed" | "cancelled";
  savePath: string;
  startedAt: number;
}

export interface DownloadState {
  notifications: DownloadNotification[];
}

export type DownloadAction =
  | { type: "STARTED"; id: string; fileName: string; url: string; totalBytes: number; savePath: string }
  | { type: "PROGRESS"; id: string; receivedBytes: number; totalBytes: number }
  | { type: "COMPLETED"; id: string; savePath: string }
  | { type: "FAILED"; id: string }
  | { type: "DISMISS"; id: string }
  | { type: "DISMISS_ALL" };
