import { DownloadState, DownloadAction, DownloadNotification } from "./types";

export const initialState: DownloadState = {
  notifications: [],
};

export function downloadReducer(
  state: DownloadState,
  action: DownloadAction
): DownloadState {
  switch (action.type) {
    case "STARTED": {
      const notification: DownloadNotification = {
        id: action.id,
        fileName: action.fileName,
        url: action.url,
        totalBytes: action.totalBytes,
        receivedBytes: 0,
        status: "in_progress",
        savePath: action.savePath,
        startedAt: Date.now(),
      };
      return {
        ...state,
        notifications: [...state.notifications, notification],
      };
    }

    case "PROGRESS": {
      return {
        ...state,
        notifications: state.notifications.map((n) =>
          n.id === action.id
            ? { ...n, receivedBytes: action.receivedBytes, totalBytes: action.totalBytes }
            : n
        ),
      };
    }

    case "COMPLETED": {
      return {
        ...state,
        notifications: state.notifications.map((n) =>
          n.id === action.id
            ? { ...n, status: "completed" as const, savePath: action.savePath, receivedBytes: n.totalBytes }
            : n
        ),
      };
    }

    case "FAILED": {
      return {
        ...state,
        notifications: state.notifications.map((n) =>
          n.id === action.id ? { ...n, status: "failed" as const } : n
        ),
      };
    }

    case "DISMISS": {
      return {
        ...state,
        notifications: state.notifications.filter((n) => n.id !== action.id),
      };
    }

    case "DISMISS_ALL": {
      return { ...state, notifications: [] };
    }

    default:
      return state;
  }
}
