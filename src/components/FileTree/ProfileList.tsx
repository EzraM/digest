import { ActionIcon, Group, Menu, SegmentedControl, Stack, Text } from "@mantine/core";
import { ProfileRecord } from "../../types/documents";
import { DEFAULT_PROFILE_ID } from "../../config/profiles";
import "./ProfileList.css";

const MoreIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <circle cx="3.25" cy="8" r="1.1" fill="currentColor" />
    <circle cx="8" cy="8" r="1.1" fill="currentColor" />
    <circle cx="12.75" cy="8" r="1.1" fill="currentColor" />
  </svg>
);

type ProfileListProps = {
  profiles: ProfileRecord[];
  activeProfileId: string | null;
  onSelectProfile: (profileId: string) => void;
  onCreateProfile?: () => void;
  onRenameProfile?: (profileId: string) => void;
  onDeleteProfile?: (profileId: string) => void;
  onToggleJiraLinks?: (profileId: string, enabled: boolean) => void;
};

export const ProfileList = ({
  profiles,
  activeProfileId,
  onSelectProfile,
  onCreateProfile,
  onRenameProfile,
  onDeleteProfile,
  onToggleJiraLinks,
}: ProfileListProps) => {
  // Determine which profile to show as selected in the SegmentedControl
  // Priority: activeProfileId if valid, otherwise first profile, otherwise null
  const isActiveProfileValid =
    activeProfileId && profiles.some((p) => p.id === activeProfileId);
  const value = isActiveProfileValid ? activeProfileId : profiles[0]?.id ?? null;

  const activeProfile = profiles.find((p) => p.id === activeProfileId);
  const canDelete = activeProfile && activeProfile.id !== DEFAULT_PROFILE_ID;
  const canRename = activeProfile !== undefined;

  return (
    <Stack className="profile-list" gap="xs">
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
              className="profile-actions-trigger"
              aria-label="Profile actions"
            >
              <MoreIcon />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown className="profile-actions-menu">
            {onCreateProfile && (
              <Menu.Item className="profile-actions-menu__item" onClick={onCreateProfile}>New profile</Menu.Item>
            )}
            {activeProfile && (canRename || canDelete) && (
              <>
                <Menu.Divider className="profile-actions-menu__divider" />
                <Menu.Label className="profile-actions-menu__label">Profile</Menu.Label>
                {canRename && onRenameProfile && (
                  <Menu.Item
                    className="profile-actions-menu__item"
                    onClick={() => onRenameProfile(activeProfile.id)}
                  >
                    Rename
                  </Menu.Item>
                )}
                {canDelete && onDeleteProfile && (
                  <Menu.Item
                    className="profile-actions-menu__item profile-actions-menu__item--danger"
                    color="red"
                    onClick={() => onDeleteProfile(activeProfile.id)}
                  >
                    Delete
                  </Menu.Item>
                )}
                {onToggleJiraLinks && (
                  <Menu.Item
                    className="profile-actions-menu__item"
                    onClick={() =>
                      onToggleJiraLinks(
                        activeProfile.id,
                        !activeProfile.settings?.plugins?.["builtin.jira-links"]
                          ?.enabled
                      )
                    }
                  >
                    {activeProfile.settings?.plugins?.["builtin.jira-links"]
                      ?.enabled
                      ? "Disable Jira links"
                      : "Enable Jira links"}
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
          classNames={{
            root: "profile-switcher",
            indicator: "profile-switcher__indicator",
            control: "profile-switcher__control",
            label: "profile-switcher__label",
          }}
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
