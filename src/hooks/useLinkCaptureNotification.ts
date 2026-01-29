import { useEffect } from "react";
import { useLinkCaptureContext } from "../context/LinkCaptureContext";

/**
 * Hook to listen for link capture IPC events and add them to the notification state
 * Should be called once at the app root level
 */
export const useLinkCaptureNotification = () => {
  const { addNotification } = useLinkCaptureContext();

  useEffect(() => {
    // Listen for IPC event from main process when a link is captured
    const unsubscribe = window.electronAPI.onLinkCaptured(
      ({ url, title }: { url: string; title: string; capturedAt: number }) => {
        addNotification(url, title);
      }
    );

    return unsubscribe;
  }, [addNotification]);
};
