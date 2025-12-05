import { Button, Group, Modal, Stack, TextInput } from "@mantine/core";
import type { KeyboardEvent } from "react";

type ProfileModalProps = {
  opened: boolean;
  title?: string;
  profileName: string;
  error?: string | null;
  isCreating: boolean;
  onNameChange: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
};

export const ProfileModal = ({
  opened,
  title = "Create profile",
  profileName,
  error,
  isCreating,
  onNameChange,
  onClose,
  onConfirm,
}: ProfileModalProps) => {
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    // Stop propagation for arrow keys and space to prevent any parent handlers
    // from intercepting these keys
    if (
      event.key === "ArrowUp" ||
      event.key === "ArrowDown" ||
      event.key === "ArrowLeft" ||
      event.key === "ArrowRight" ||
      event.key === " "
    ) {
      event.stopPropagation();
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title={title} centered>
      <Stack gap="sm">
        <TextInput
          label="Profile name"
          placeholder="Work"
          value={profileName}
          onChange={(event) => onNameChange(event.currentTarget.value)}
          onKeyDown={handleKeyDown}
          error={error}
          data-autofocus
        />
      <Group justify="flex-end">
        <Button variant="default" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={onConfirm} loading={isCreating}>
          Create
        </Button>
      </Group>
    </Stack>
  </Modal>
  );
};
