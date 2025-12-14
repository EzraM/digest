import { Box, Text, Button, Stack, Group, Anchor } from "@mantine/core";
import { ClipDraft } from "../../types/clip";
import { ClipDraftEditor } from "./ClipDraftEditor";
import { ClipCommitService } from "../../services/ClipCommitService";
import { log } from "../../utils/rendererLogger";
import { getCurrentCursorBlockId } from "../../hooks/useRendererEditor";

type ClipDraftItemProps = {
  draft: ClipDraft;
  onRemove: () => void;
};

/**
 * Individual clip draft item with preview/edit editor
 */
export const ClipDraftItem = ({ draft, onRemove }: ClipDraftItemProps) => {
  const commitService = ClipCommitService.getInstance();

  const handleInsert = async () => {
    try {
      log.debug(`Inserting clip draft ${draft.id}`, "ClipDraftItem");

      // Insert after the currently selected block if available; otherwise append.
      const insertAfterBlockId = getCurrentCursorBlockId() ?? undefined;
      const { operations, origin } = await commitService.createClipOperations(
        draft,
        insertAfterBlockId
      );

      // Apply operations via IPC
      const result = await window.electronAPI.applyBlockOperations(
        operations,
        origin
      );

      if (result.success) {
        log.debug(
          `Successfully inserted clip draft ${draft.id}`,
          "ClipDraftItem"
        );
        onRemove();
      } else {
        log.debug(
          `Failed to insert clip draft ${draft.id}: ${result.errors?.join(", ")}`,
          "ClipDraftItem"
        );
        // TODO: Show error to user
      }
    } catch (error) {
      log.debug(
        `Error inserting clip draft ${draft.id}: ${error}`,
        "ClipDraftItem"
      );
      // TODO: Show error to user
    }
  };

  const handleDiscard = () => {
    log.debug(`Discarding clip draft ${draft.id}`, "ClipDraftItem");
    onRemove();
  };

  return (
    <Box
      style={{
        border: "1px solid var(--mantine-color-default-border)",
        borderRadius: "4px",
        padding: "12px",
        backgroundColor: "var(--mantine-color-gray-0)",
      }}
    >
      <Stack gap="xs">
        {/* Header with source info */}
        <Group justify="space-between" align="flex-start">
          <Box style={{ flex: 1 }}>
            <Text size="xs" c="dimmed" mb={4}>
              From{" "}
              <Anchor
                href={draft.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                size="xs"
              >
                {draft.sourceTitle || draft.sourceUrl}
              </Anchor>
            </Text>
            {draft.conversion?.status === "converting" && (
              <Text size="xs" c="blue">
                Converting...
              </Text>
            )}
            {draft.conversion?.status === "failed" && (
              <Text size="xs" c="red">
                Conversion failed: {draft.conversion.error}
              </Text>
            )}
          </Box>
          <Group gap="xs">
            <Button size="xs" variant="subtle" onClick={handleDiscard}>
              Discard
            </Button>
            {draft.conversion?.status === "completed" && (
              <Button size="xs" onClick={handleInsert}>
                Insert
              </Button>
            )}
          </Group>
        </Group>

        {/* Mini BlockNote editor for preview/edit */}
        {draft.proposedBlocks && draft.proposedBlocks.length > 0 && (
          <Box
            style={{
              border: "1px solid var(--mantine-color-default-border)",
              borderRadius: "4px",
              padding: "8px",
              backgroundColor: "var(--mantine-color-white)",
              maxHeight: "200px",
              overflowY: "auto",
            }}
          >
            <ClipDraftEditor draft={draft} />
          </Box>
        )}
      </Stack>
    </Box>
  );
};
