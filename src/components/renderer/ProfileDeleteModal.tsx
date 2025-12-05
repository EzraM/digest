import { Button, Group, Modal, Stack, Text } from "@mantine/core";

type ProfileDeleteModalProps = {
  opened: boolean;
  profileName: string;
  pageCount: number;
  onClose: () => void;
  onConfirm: () => void;
};

export const ProfileDeleteModal = ({
  opened,
  profileName,
  pageCount,
  onClose,
  onConfirm,
}: ProfileDeleteModalProps) => {
  const pageCountText =
    pageCount === 0
      ? "This profile has no pages."
      : pageCount === 1
      ? "This will delete 1 page associated with this profile."
      : `This will delete ${pageCount} pages associated with this profile.`;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Delete profile"
      centered
      size="sm"
    >
      <Stack gap="md">
        <Text size="sm">
          Are you sure you want to delete the profile <strong>"{profileName}"</strong>?
        </Text>
        <Text size="sm" c="dimmed">
          {pageCountText} This action cannot be undone.
        </Text>
        <Group justify="flex-end" gap="xs">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button color="red" onClick={onConfirm}>
            Delete
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};

