import { useContext, useEffect } from "react";
import { CustomBlockNoteEditor } from "../../types/schema";
import { BlockNotificationContext } from "../../context/BlockNotificationContext";
import { SiteBlockNotification } from "../../Browser/components/SiteBlockNotification";
import { log } from "../../utils/rendererLogger";

type BlockNotificationContainerProps = {
  editor: CustomBlockNoteEditor;
};

/**
 * Container component that renders all pending block notifications.
 * Uses the BlockNotificationContext to track which blocks need notifications.
 * Gracefully handles case where context might not be available.
 */
export const BlockNotificationContainer = ({
  editor,
}: BlockNotificationContainerProps) => {
  // Use useContext directly to avoid throwing if context isn't available
  const context = useContext(BlockNotificationContext);

  // If context isn't available, don't render anything
  if (!context) {
    return null;
  }

  const { pendingBlockIds, removeNotification } = context;

  // Note: We don't check editor.view availability here because:
  // 1. On initial mount, the view doesn't exist yet (BlockNoteView creates it)
  // 2. During transitions, the view might be torn down, but we can't distinguish
  //    between these cases reliably
  // Instead, we use try-catch around editor.getBlock() calls as a safety net

  useEffect(() => {
    if (pendingBlockIds.length > 0) {
      log.debug(
        `BlockNotificationContainer: Rendering ${pendingBlockIds.length} notification(s): ${pendingBlockIds.join(", ")}`,
        "BlockNotificationContainer"
      );
    }
  }, [pendingBlockIds]);

  return (
    <>
      {pendingBlockIds.map((blockId) => {
        try {
          const block = editor.getBlock(blockId);
          if (!block || block.type !== "site") {
            return null;
          }

          const url = block.props.url;
          if (!url) {
            return null;
          }

          return (
            <SiteBlockNotification
              key={blockId}
              blockId={blockId}
              url={url}
              onAnimationComplete={() => removeNotification(blockId)}
            />
          );
        } catch (error) {
          // Editor view may become unavailable during route transitions
          // Silently skip rendering this notification
          return null;
        }
      })}
    </>
  );
};
