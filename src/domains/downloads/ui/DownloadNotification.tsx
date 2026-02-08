import { useEffect, useCallback } from "react";
import { useDownloadContext } from "./DownloadContext";
import { usePageToolSlot } from "../../../context/PageToolSlotContext";
import { DownloadItemView } from "./DownloadItemView";

/**
 * Component that manages download notification lifecycle.
 * - Shows download progress in PageToolSlot
 * - Auto-dismisses completed/failed downloads after a delay
 * - Clicking a completed download opens the folder
 */
export const DownloadNotification = (): null => {
  const { notifications, removeNotification } = useDownloadContext();
  const { registerTool, unregisterTool } = usePageToolSlot();

  const handleClick = useCallback((savePath: string) => {
    window.electronAPI.downloadShowInFolder(savePath);
  }, []);

  // Auto-dismiss completed/failed notifications after 5 seconds
  useEffect(() => {
    const finished = notifications.filter(
      (n) => n.status === "completed" || n.status === "failed" || n.status === "cancelled"
    );

    if (finished.length === 0) return;

    const timers = finished.map((notification) =>
      setTimeout(() => {
        removeNotification(notification.id);
      }, 5000)
    );

    return () => {
      timers.forEach((timer) => clearTimeout(timer));
    };
  }, [notifications, removeNotification]);

  // Register with PageToolSlot
  useEffect(() => {
    if (notifications.length > 0) {
      const content = (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {notifications.map((notification) => (
            <DownloadItemView
              key={notification.id}
              notification={notification}
              onClick={handleClick}
            />
          ))}
        </div>
      );
      registerTool("downloads", content);
    } else {
      unregisterTool("downloads");
    }

    return () => {
      unregisterTool("downloads");
    };
  }, [notifications, registerTool, unregisterTool, handleClick]);

  return null;
};
