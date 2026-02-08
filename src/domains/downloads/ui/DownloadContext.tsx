import { createContext, useContext, ReactNode, useReducer, useCallback } from "react";
import { DownloadNotification } from "../core/types";
import { downloadReducer, initialState } from "../core/reducer";
import * as commands from "../core/commands";
import * as selectors from "../core/selectors";

interface DownloadContextType {
  notifications: DownloadNotification[];
  addDownload: (id: string, fileName: string, url: string, totalBytes: number, savePath: string) => void;
  updateProgress: (id: string, receivedBytes: number, totalBytes: number) => void;
  markCompleted: (id: string, savePath: string) => void;
  markFailed: (id: string) => void;
  removeNotification: (id: string) => void;
  hasNotifications: boolean;
}

const DownloadContext = createContext<DownloadContextType | null>(null);

export const DownloadProvider = ({ children }: { children: ReactNode }) => {
  const [state, dispatch] = useReducer(downloadReducer, initialState);

  const addDownload = useCallback(
    (id: string, fileName: string, url: string, totalBytes: number, savePath: string) => {
      dispatch(commands.started(id, fileName, url, totalBytes, savePath));
    },
    []
  );

  const updateProgress = useCallback((id: string, receivedBytes: number, totalBytes: number) => {
    dispatch(commands.progress(id, receivedBytes, totalBytes));
  }, []);

  const markCompleted = useCallback((id: string, savePath: string) => {
    dispatch(commands.completed(id, savePath));
  }, []);

  const markFailed = useCallback((id: string) => {
    dispatch(commands.failed(id));
  }, []);

  const removeNotification = useCallback((id: string) => {
    dispatch(commands.dismiss(id));
  }, []);

  return (
    <DownloadContext.Provider
      value={{
        notifications: selectors.getNotifications(state),
        addDownload,
        updateProgress,
        markCompleted,
        markFailed,
        removeNotification,
        hasNotifications: selectors.hasNotifications(state),
      }}
    >
      {children}
    </DownloadContext.Provider>
  );
};

export const useDownloadContext = (): DownloadContextType => {
  const context = useContext(DownloadContext);
  if (!context) {
    throw new Error("useDownloadContext must be used within DownloadProvider");
  }
  return context;
};
