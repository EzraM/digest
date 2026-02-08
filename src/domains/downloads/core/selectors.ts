import { DownloadState, DownloadNotification } from "./types";

export function getNotifications(state: DownloadState): DownloadNotification[] {
  return state.notifications;
}

export function getNotificationCount(state: DownloadState): number {
  return state.notifications.length;
}

export function hasNotifications(state: DownloadState): boolean {
  return state.notifications.length > 0;
}

export function getActiveDownloads(state: DownloadState): DownloadNotification[] {
  return state.notifications.filter((n) => n.status === "in_progress");
}
