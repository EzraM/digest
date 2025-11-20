import { ActionIcon, Menu, Text } from "@mantine/core";
import { DocumentRecord, ProfileRecord } from "../../types/documents";

type DocumentActionsProps = {
  document: DocumentRecord;
  profiles: ProfileRecord[];
  canCreateChild: boolean;
  onCreateChild: () => void;
  onRename: () => void;
  onDelete: () => void;
  onMoveToProfile: (profileId: string) => void;
};

export const DocumentActions = ({
  document,
  profiles,
  canCreateChild,
  onCreateChild,
  onRename,
  onDelete,
  onMoveToProfile,
}: DocumentActionsProps) => {
  const otherProfiles = profiles.filter(
    (profile) => profile.id !== document.profileId
  );

  return (
    <Menu withinPortal position="bottom-end">
      <Menu.Target>
        <ActionIcon
          variant="subtle"
          size="sm"
          radius="md"
          aria-label="Document actions"
        >
          <Text fw={600} size="xs">
            ...
          </Text>
        </ActionIcon>
      </Menu.Target>

      <Menu.Dropdown>
        <Menu.Label>Page</Menu.Label>
        <Menu.Item onClick={onRename}>Rename</Menu.Item>
        <Menu.Item
          onClick={onCreateChild}
          disabled={!canCreateChild}
          title={
            canCreateChild
              ? undefined
              : "Maximum depth reached for this document"
          }
        >
          New nested page
        </Menu.Item>
        <Menu.Item color="red" onClick={onDelete}>
          Delete
        </Menu.Item>

        <Menu.Divider />
        <Menu.Label>Move to profile</Menu.Label>
        {otherProfiles.length === 0 ? (
          <Menu.Item disabled>No other profiles</Menu.Item>
        ) : (
          otherProfiles.map((profile) => (
            <Menu.Item
              key={profile.id}
              onClick={() => onMoveToProfile(profile.id)}
            >
              {profile.name}
            </Menu.Item>
          ))
        )}
      </Menu.Dropdown>
    </Menu>
  );
};
