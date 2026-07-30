import { Button, Group, Modal, Stack, Text, TextInput } from "@mantine/core";
import type { KeyboardEvent } from "react";
import "./ProfileModal.css";

type ProfileModalProps = {
  opened: boolean;
  title?: string;
  description?: string;
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
  description,
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
    <Modal
      opened={opened}
      onClose={onClose}
      title={title}
      centered
      classNames={{ content: "profile-modal", header: "profile-modal__header" }}
    >
      <Stack gap="md">
        {description && (
          <Text className="profile-modal__description">
            {description}
          </Text>
        )}
        <TextInput
          label={description ? "What part of your life is this for?" : "Profile name"}
          placeholder={description ? "Work, school, personal…" : "Work"}
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
            {description ? "Create profile" : "Save"}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};
