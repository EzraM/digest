import { ActionIcon, Button, Group, Menu, SegmentedControl, Stack, Text } from "@mantine/core";
import { ProfileRecord } from "../../types/documents";
import { DEFAULT_PROFILE_ID } from "../../config/profiles";

type ProfileListProps = {
  profiles: ProfileRecord[];
  activeProfileId: string | null;
  onSelectProfile: (profileId: string) => void;
  onCreateProfile?: () => void;
  onRenameProfile?: (profileId: string) => void;
  onDeleteProfile?: (profileId: string) => void;
};

export const ProfileList = ({
  profiles,
  activeProfileId,
  onSelectProfile,
  onCreateProfile,
  onRenameProfile,
  onDeleteProfile,
}: ProfileListProps) => {
  const value =
    profiles.length > 0 &&
    (activeProfileId &&
      profiles.some((profile) => profile.id === activeProfileId) &&
      activeProfileId) ||
    (profiles.length > 0 ? profiles[0].id : null);

  const activeProfile = profiles.find((p) => p.id === activeProfileId);
  const canDelete = activeProfile && activeProfile.id !== DEFAULT_PROFILE_ID;
  const canRename = activeProfile !== undefined;

  return (
    <Stack gap="xs">
      <Group justify="space-between">
        <Text fw={600} size="sm">
          Profiles
        </Text>
        <Menu withinPortal position="bottom-end">
          <Menu.Target>
            <ActionIcon
              variant="subtle"
              size="sm"
              radius="md"
              aria-label="Profile actions"
            >
              <Text fw={600} size="xs">
                ...
              </Text>
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            {onCreateProfile && (
              <Menu.Item onClick={onCreateProfile}>New profile</Menu.Item>
            )}
            {activeProfile && (canRename || canDelete) && (
              <>
                <Menu.Divider />
                <Menu.Label>Profile</Menu.Label>
                {canRename && onRenameProfile && (
                  <Menu.Item
                    onClick={() => onRenameProfile(activeProfile.id)}
                  >
                    Rename
                  </Menu.Item>
                )}
                {canDelete && onDeleteProfile && (
                  <Menu.Item
                    color="red"
                    onClick={() => onDeleteProfile(activeProfile.id)}
                  >
                    Delete
                  </Menu.Item>
                )}
              </>
            )}
          </Menu.Dropdown>
        </Menu>
      </Group>
      {profiles.length === 0 ? (
        <Text size="sm" c="dimmed">
          No profiles available yet.
        </Text>
      ) : (
        <SegmentedControl
          size="xs"
          fullWidth
          value={value || undefined}
          onChange={onSelectProfile}
          data={profiles.map((profile) => ({
            label: profile.name,
            value: profile.id,
          }))}
        />
      )}
    </Stack>
  );
};
