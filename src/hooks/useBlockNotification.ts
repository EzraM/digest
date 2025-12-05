import { useState, useCallback } from "react";
import { log } from "../utils/rendererLogger";

/**
 * Hook to manage block notification state.
 * Tracks which blocks need to show a bounce notification.
 */
export const useBlockNotification = () => {
  const [pendingNotifications, setPendingNotifications] = useState<Set<string>>(
    new Set()
  );

  const triggerNotification = useCallback((blockId: string) => {
    log.debug(
      `Triggering notification for blockId: ${blockId}`,
      "useBlockNotification"
    );
    setPendingNotifications((prev) => new Set([...prev, blockId]));

    // Auto-remove after 10 seconds (temporarily longer for testing visibility)
    setTimeout(() => {
      setPendingNotifications((prev) => {
        const next = new Set(prev);
        next.delete(blockId);
        return next;
      });
    }, 10000);
  }, []);

  const removeNotification = useCallback((blockId: string) => {
    log.debug(
      `Removing notification for blockId: ${blockId}`,
      "useBlockNotification"
    );
    setPendingNotifications((prev) => {
      const next = new Set(prev);
      next.delete(blockId);
      return next;
    });
  }, []);

  return {
    pendingBlockIds: Array.from(pendingNotifications),
    triggerNotification,
    removeNotification,
  };
};
