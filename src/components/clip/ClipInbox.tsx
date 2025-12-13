import { useEffect, useMemo } from "react";
import { Box, Text, Stack } from "@mantine/core";
import { useClipDraftContext } from "../../context/ClipDraftContext";
import { usePageToolSlot } from "../../context/PageToolSlotContext";
import { ClipDraftItem } from "./ClipDraftItem";
import { log } from "../../utils/rendererLogger";

/**
 * Clip inbox panel: shows pending clip drafts for review/edit
 * Registers itself with PageToolSlotContext when drafts exist
 */
export const ClipInbox = (): null => {
  const { drafts, removeDraft } = useClipDraftContext();
  const { registerTool, unregisterTool } = usePageToolSlot();

  log.debug(`ClipInbox: Mounted with ${drafts.length} drafts`, "ClipInbox");

  // Memoize the content to avoid recreating JSX on every render
  const toolContent = useMemo(() => {
    if (drafts.length === 0) {
      log.debug("ClipInbox: No drafts, toolContent is null", "ClipInbox");
      return null;
    }

    log.debug(
      `ClipInbox: Creating toolContent for ${drafts.length} drafts`,
      "ClipInbox"
    );
    return (
      <Box
        style={{
          padding: "12px",
          maxHeight: "400px",
          overflowY: "auto",
          boxShadow: "0 -2px 8px rgba(0, 0, 0, 0.1)",
        }}
      >
        <Stack gap="xs">
          <Text size="sm" fw={500}>
            Clip Drafts ({drafts.length})
          </Text>
          {drafts.map((draft) => (
            <ClipDraftItem
              key={draft.id}
              draft={draft}
              onRemove={() => removeDraft(draft.id)}
            />
          ))}
        </Stack>
      </Box>
    );
  }, [drafts, removeDraft]);

  // Register/unregister based on content availability
  useEffect(() => {
    log.debug(
      `ClipInbox: useEffect running, toolContent is ${toolContent !== null ? "not null" : "null"}`,
      "ClipInbox"
    );
    if (toolContent !== null) {
      log.debug("ClipInbox: Registering tool content", "ClipInbox");
      registerTool(toolContent);
    } else {
      log.debug("ClipInbox: Unregistering tool", "ClipInbox");
      unregisterTool();
    }

    // Cleanup: unregister on unmount
    return () => {
      log.debug("ClipInbox: Cleanup - unregistering tool", "ClipInbox");
      unregisterTool();
    };
  }, [toolContent, registerTool, unregisterTool]);

  // This component doesn't render anything itself - it registers content via context
  return null;
};
