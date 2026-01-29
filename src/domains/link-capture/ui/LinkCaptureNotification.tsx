import { useEffect } from "react";
import { useLinkCaptureContext } from "./LinkCaptureContext";
import { usePageToolSlot } from "../../../context/PageToolSlotContext";
import { LinkCaptureItem } from "./LinkCaptureItem";

/**
 * Component that manages link capture notification lifecycle
 * - Shows all captured links stacked in PageToolSlot
 * - Auto-dismisses each notification after 3 seconds
 * - Registers with unique ID to coexist with ClipInbox
 */
export const LinkCaptureNotification = (): null => {
  const { notifications, removeNotification } = useLinkCaptureContext();
  const { registerTool, unregisterTool } = usePageToolSlot();

  // Auto-dismiss notifications after 3 seconds each
  // Set up timers for all notifications
  useEffect(() => {
    if (notifications.length === 0) return;

    // Create timers for each notification
    const timers = notifications.map((notification) => {
      return setTimeout(() => {
        removeNotification(notification.id);
      }, 3000);
    });

    // Clean up all timers on unmount or when notifications change
    return () => {
      timers.forEach((timer) => clearTimeout(timer));
    };
  }, [notifications, removeNotification]);

  // Register with PageToolSlot - show all notifications stacked
  // Visibility is automatically managed by PageToolSlotContext
  useEffect(() => {
    if (notifications.length > 0) {
      // Stack all notifications vertically
      const content = (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {notifications.map((notification) => (
            <LinkCaptureItem
              key={notification.id}
              url={notification.url}
              title={notification.title}
            />
          ))}
        </div>
      );
      registerTool('link-capture', content);
    } else {
      unregisterTool('link-capture');
    }

    return () => {
      unregisterTool('link-capture');
    };
  }, [notifications, registerTool, unregisterTool]);

  // This component doesn't render anything itself - it registers content via context
  return null;
};
