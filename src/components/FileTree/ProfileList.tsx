import { useState } from "react";
import { ActionIcon, Menu, Stack, Text } from "@mantine/core";
import { ProfileRecord } from "../../types/documents";
import { DEFAULT_PROFILE_ID } from "../../config/profiles";
import "./ProfileList.css";

type ProfileListProps = {
  profiles: ProfileRecord[];
  activeProfileId: string | null;
  onSelectProfile: (profileId: string) => void;
  onCreateProfile: () => void;
  onRenameProfile?: (profileId: string) => void;
  onDeleteProfile?: (profileId: string) => void;
  onOpenSettings?: (profileId: string) => void;
  onReorderProfiles: (profileIds: string[]) => void;
};

export const ProfileList = ({
  profiles,
  activeProfileId,
  onSelectProfile,
  onCreateProfile,
  onRenameProfile,
  onDeleteProfile,
  onOpenSettings,
  onReorderProfiles,
}: ProfileListProps) => {
  const [draggedProfileId, setDraggedProfileId] = useState<string | null>(null);
  // Determine which profile to show as selected in the SegmentedControl
  // Priority: activeProfileId if valid, otherwise first profile, otherwise null
  const isActiveProfileValid =
    activeProfileId && profiles.some((p) => p.id === activeProfileId);
  const value = isActiveProfileValid ? activeProfileId : profiles[0]?.id ?? null;

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
    <Stack className="profile-list" gap={0}>
      <div className="profile-list__heading">
        <span>Profiles</span>
        <button
          type="button"
          className="file-tree__section-add"
          onClick={onCreateProfile}
          aria-label="New profile"
          title="New profile"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M8 3.25v9.5M3.25 8h9.5" />
          </svg>
        </button>
      </div>
      {profiles.length === 0 ? (
        <Text size="sm" c="dimmed">
          No profiles available yet.
        </Text>
      ) : (
        <div
          className="profile-switcher profile-switcher--stacked"
          role="tablist"
          aria-orientation="vertical"
        >
          {profiles.map((profile) => (
            <div
              key={profile.id}
              className="profile-switcher__row"
              data-selected={profile.id === value || undefined}
              draggable
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
                const placeAfter = event.clientY > bounds.top + bounds.height / 2;
                if (draggedId) moveProfile(draggedId, profile.id, placeAfter);
                setDraggedProfileId(null);
              }}
              title="Drag to reorder, or use Alt + arrow key"
            >
              <button
                type="button"
                role="tab"
                aria-selected={profile.id === value}
                className="profile-switcher__control"
                onClick={() => onSelectProfile(profile.id)}
                onKeyDown={(event) => {
                  if (!event.altKey) return;
                  const previousKey = "ArrowUp";
                  const nextKey = "ArrowDown";
                  if (event.key === previousKey || event.key === nextKey) {
                    event.preventDefault();
                    moveProfileBy(
                      profile.id,
                      event.key === previousKey ? -1 : 1
                    );
                  }
                }}
              >
                <span className="profile-switcher__grip" aria-hidden="true">⠿</span>
                <span className="profile-switcher__label">{profile.name}</span>
              </button>
              <ProfileActionsMenu
                profile={profile}
                onRenameProfile={onRenameProfile}
                onDeleteProfile={onDeleteProfile}
                onOpenSettings={onOpenSettings}
              />
            </div>
          ))}
        </div>
      )}
    </Stack>
  );
};

export const ProfileActionsMenu = ({
  profile,
  onRenameProfile,
  onDeleteProfile,
  onOpenSettings,
}: Pick<ProfileListProps, "onRenameProfile" | "onDeleteProfile" | "onOpenSettings"> & {
  profile: ProfileRecord;
}) => {
  const canDelete = profile.id !== DEFAULT_PROFILE_ID;

  return (
    <Menu withinPortal position="bottom-end">
      <Menu.Target>
        <ActionIcon
          variant="subtle"
          size="sm"
          radius="md"
          className="profile-switcher__actions"
          aria-label={`${profile.name} settings`}
          onClick={(event) => event.stopPropagation()}
        >
          <Text fw={600} size="xs">...</Text>
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown className="profile-actions-menu">
        <Menu.Label className="profile-actions-menu__label">
          {profile.name}
        </Menu.Label>
        {onOpenSettings && (
          <Menu.Item className="profile-actions-menu__item" onClick={() => onOpenSettings(profile.id)}>
            Settings
          </Menu.Item>
        )}
        {onRenameProfile && (
          <Menu.Item
            className="profile-actions-menu__item"
            onClick={() => onRenameProfile(profile.id)}
          >
            Rename
          </Menu.Item>
        )}
        {canDelete && onDeleteProfile && (
          <Menu.Item
            className="profile-actions-menu__item profile-actions-menu__item--danger"
            color="red"
            onClick={() => onDeleteProfile(profile.id)}
          >
            Delete
          </Menu.Item>
        )}
      </Menu.Dropdown>
    </Menu>
  );
};
