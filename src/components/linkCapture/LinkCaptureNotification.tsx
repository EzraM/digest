import { useEffect } from "react";
import { useLinkCaptureContext } from "../../context/LinkCaptureContext";
import { usePageToolSlot } from "../../context/PageToolSlotContext";
import { LinkCaptureItem } from "./LinkCaptureItem";

/**
 * Component that manages link capture notification lifecycle
 * - Shows latest captured link in PageToolSlot
 * - Auto-dismisses after 3 seconds
 * - Registers with unique ID to coexist with ClipInbox
 */
export const LinkCaptureNotification = (): null => {
  const { notifications, removeNotification } = useLinkCaptureContext();
  const { registerTool, unregisterTool } = usePageToolSlot();

  // Auto-dismiss after 3 seconds
  useEffect(() => {
    if (notifications.length === 0) return;

    const latest = notifications[0];
    const timer = setTimeout(() => {
      removeNotification(latest.id);
    }, 3000);

    return () => clearTimeout(timer);
  }, [notifications, removeNotification]);

  // Register with PageToolSlot using unique ID
  useEffect(() => {
    if (notifications.length > 0) {
      const latest = notifications[0];
      const content = (
        <LinkCaptureItem url={latest.url} title={latest.title} />
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
