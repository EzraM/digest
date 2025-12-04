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
      })}
    </>
  );
};
