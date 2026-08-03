import { ActionIcon, Divider, Group, Paper, Stack, Text, Title } from "@mantine/core";
import { createBuiltInRendererModules } from "../../integrations/builtInRendererModules";
import { ProfileRecord, ProfileSettings } from "../../types/documents";

const contributions = createBuiltInRendererModules().flatMap((module) => module.settings ?? []);

export const ProfileSettingsPage = ({ profile, onClose, onUpdated }: {
  profile: ProfileRecord;
  onClose: () => void;
  onUpdated: (profile: ProfileRecord) => void;
}) => {
  const updateSettings = async (settings: ProfileSettings) => {
    const updated = await window.electronAPI.profiles.updateSettings({ profileId: profile.id, settings });
    onUpdated(updated);
  };

  return (
    <Stack maw={760} mx="auto" px="xl" py="xl" gap="xl">
      <Group justify="space-between" align="flex-start">
        <div><Text size="sm" c="dimmed">{profile.name}</Text><Title order={1}>Settings</Title></div>
        <ActionIcon variant="subtle" size="lg" aria-label="Close settings" onClick={onClose}>×</ActionIcon>
      </Group>
      <Divider />
      {contributions.map(({ id, title, description, Panel }) => (
        <Paper key={id} withBorder p="xl" radius="md">
          <Stack gap="lg">
            <div><Title order={3}>{title}</Title><Text c="dimmed" size="sm">{description}</Text></div>
            <Panel profile={profile} updateSettings={updateSettings} />
          </Stack>
        </Paper>
      ))}
    </Stack>
  );
};
