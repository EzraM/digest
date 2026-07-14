import { useState } from "react";
import { Box, Text, Button, Stack, Group, Anchor } from "@mantine/core";
import { ClipDraft } from "../../domains/clip/types";
import { ClipDraftEditor } from "./ClipDraftEditor";
import { ClipCommitService } from "../../domains/clip/services/ClipCommitService";
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
  const [insertError, setInsertError] = useState<string | null>(null);

  const handleInsert = async () => {
    setInsertError(null);
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
        await attachDraftImagesToActiveDocument(draft).catch((error) => {
          log.debug(
            `Failed to attach draft images for ${draft.id}: ${error}`,
            "ClipDraftItem"
          );
        });
        log.debug(
          `Successfully inserted clip draft ${draft.id}`,
          "ClipDraftItem"
        );
        onRemove();
      } else {
        const errorMsg = result.errors?.join(", ") || "Unknown error";
        log.debug(
          `Failed to insert clip draft ${draft.id}: ${errorMsg}`,
          "ClipDraftItem"
        );
        setInsertError(`Failed to insert clip: ${errorMsg}`);
      }
    } catch (error) {
      log.debug(
        `Error inserting clip draft ${draft.id}: ${error}`,
        "ClipDraftItem"
      );
      setInsertError(
        `Failed to insert clip: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  };

  const handleDiscard = () => {
    log.debug(`Discarding clip draft ${draft.id}`, "ClipDraftItem");
    void discardDraft(draft).finally(onRemove);
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
            {insertError && (
              <Text size="xs" c="red">
                {insertError}
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

const attachDraftImagesToActiveDocument = async (draft: ClipDraft) => {
  const imageIds = draft.context?.imageIds ?? [];
  if (imageIds.length === 0) return;

  const activeDocument = await window.electronAPI.documents.getActive();
  if (!activeDocument) return;

  await Promise.all(
    imageIds.map((imageId) =>
      window.electronAPI.image.attachImageToDocument({
        imageId,
        documentId: activeDocument.id,
      })
    )
  );
};

const discardDraft = async (draft: ClipDraft) => {
  const imageIds = draft.context?.imageIds ?? [];
  if (imageIds.length === 0) return;

  await Promise.all(
    imageIds.map((imageId) =>
      window.electronAPI.image.deleteImage(imageId).catch((error) => {
        log.debug(
          `Failed to delete draft image ${imageId}: ${error}`,
          "ClipDraftItem"
        );
        return false;
      })
    )
  );
};
