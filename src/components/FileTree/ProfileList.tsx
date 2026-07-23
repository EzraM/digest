import { useState } from "react";
import { ActionIcon, Group, Menu, Stack, Text } from "@mantine/core";
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
  onReorderProfiles: (profileIds: string[]) => void;
};

export const ProfileList = ({
  profiles,
  activeProfileId,
  onSelectProfile,
  onCreateProfile,
  onRenameProfile,
  onDeleteProfile,
  onToggleJiraLinks,
  onReorderProfiles,
}: ProfileListProps) => {
  const [draggedProfileId, setDraggedProfileId] = useState<string | null>(null);
  // Determine which profile to show as selected in the SegmentedControl
  // Priority: activeProfileId if valid, otherwise first profile, otherwise null
  const isActiveProfileValid =
    activeProfileId && profiles.some((p) => p.id === activeProfileId);
  const value = isActiveProfileValid ? activeProfileId : profiles[0]?.id ?? null;

  const activeProfile = profiles.find((p) => p.id === activeProfileId);
  const canDelete = activeProfile && activeProfile.id !== DEFAULT_PROFILE_ID;
  const canRename = activeProfile !== undefined;
  const isStacked = profiles.length > 3;

  const moveProfile = (
    profileId: string,
    targetProfileId: string,
    placeAfter = false
  ) => {
    if (profileId === targetProfileId) return;
    const nextIds = profiles.map((profile) => profile.id);
    const from = nextIds.indexOf(profileId);
    if (from < 0 || !nextIds.includes(targetProfileId)) return;
    const [movedId] = nextIds.splice(from, 1);
    const targetIndex = nextIds.indexOf(targetProfileId);
    nextIds.splice(targetIndex + (placeAfter ? 1 : 0), 0, movedId);
    onReorderProfiles(nextIds);
  };

  const moveProfileBy = (profileId: string, offset: number) => {
    const index = profiles.findIndex((profile) => profile.id === profileId);
    const target = profiles[index + offset];
    if (target) moveProfile(profileId, target.id, offset > 0);
  };

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
        <div
          className={`profile-switcher${isStacked ? " profile-switcher--stacked" : ""}`}
          role="tablist"
          aria-orientation={isStacked ? "vertical" : "horizontal"}
        >
          {profiles.map((profile) => (
            <button
              key={profile.id}
              type="button"
              role="tab"
              aria-selected={profile.id === value}
              className="profile-switcher__control"
              draggable
              onClick={() => onSelectProfile(profile.id)}
              onDragStart={(event) => {
                setDraggedProfileId(profile.id);
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", profile.id);
              }}
              onDragEnd={() => setDraggedProfileId(null)}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
              }}
              onDrop={(event) => {
                event.preventDefault();
                const draggedId =
                  draggedProfileId || event.dataTransfer.getData("text/plain");
                const bounds = event.currentTarget.getBoundingClientRect();
                const placeAfter = isStacked
                  ? event.clientY > bounds.top + bounds.height / 2
                  : event.clientX > bounds.left + bounds.width / 2;
                if (draggedId) moveProfile(draggedId, profile.id, placeAfter);
                setDraggedProfileId(null);
              }}
              onKeyDown={(event) => {
                if (!event.altKey) return;
                const previousKey = isStacked ? "ArrowUp" : "ArrowLeft";
                const nextKey = isStacked ? "ArrowDown" : "ArrowRight";
                if (event.key === previousKey || event.key === nextKey) {
                  event.preventDefault();
                  moveProfileBy(profile.id, event.key === previousKey ? -1 : 1);
                }
              }}
              title="Drag to reorder, or use Alt + arrow key"
            >
              <span className="profile-switcher__grip" aria-hidden="true">⠿</span>
              <span className="profile-switcher__label">{profile.name}</span>
            </button>
          ))}
        </div>
      )}
    </Stack>
  );
};
