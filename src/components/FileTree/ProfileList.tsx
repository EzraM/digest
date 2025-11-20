import { Button, Group, SegmentedControl, Stack, Text } from "@mantine/core";
import { ProfileRecord } from "../../types/documents";

type ProfileListProps = {
  profiles: ProfileRecord[];
  activeProfileId: string | null;
  onSelectProfile: (profileId: string) => void;
  onCreateProfile?: () => void;
};

export const ProfileList = ({
  profiles,
  activeProfileId,
  onSelectProfile,
  onCreateProfile,
}: ProfileListProps) => {
  if (!profiles.length) {
    return (
      <Stack gap="xs">
        <Group justify="space-between">
          <Text fw={600} size="sm">
            Profiles
          </Text>
          {onCreateProfile && (
            <Button size="compact-xs" variant="subtle" onClick={onCreateProfile}>
              New profile
            </Button>
          )}
        </Group>
        <Text size="sm" c="dimmed">
          No profiles available yet.
        </Text>
      </Stack>
    );
  }

  const value =
    (activeProfileId &&
      profiles.some((profile) => profile.id === activeProfileId) &&
      activeProfileId) ||
    profiles[0].id;

  return (
    <Stack gap="xs">
      <Group justify="space-between">
        <Text fw={600} size="sm">
          Profiles
        </Text>
        {onCreateProfile && (
          <Button size="compact-xs" variant="subtle" onClick={onCreateProfile}>
            New profile
          </Button>
        )}
      </Group>
      <SegmentedControl
        size="xs"
        fullWidth
        value={value}
        onChange={onSelectProfile}
        data={profiles.map((profile) => ({
          label: profile.name,
          value: profile.id,
        }))}
      />
    </Stack>
  );
};
