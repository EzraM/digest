import { Button, Group, Stack, Switch, TextInput } from "@mantine/core";
import { useEffect, useState } from "react";
import { ProfileSettingsPanelProps, RendererModule } from "../../../../services/RendererModule";

const DEFAULT_BASE_URL = "https://learning-ally.atlassian.net/browse";

const JiraLinksSettings = ({ profile, updateSettings }: ProfileSettingsPanelProps) => {
  const current = profile.settings?.plugins?.["builtin.jira-links"];
  const [enabled, setEnabled] = useState(current?.enabled ?? false);
  const [baseUrl, setBaseUrl] = useState(current?.baseUrl ?? DEFAULT_BASE_URL);
  const [projectKeys, setProjectKeys] = useState(current?.projectKeys?.join(", ") ?? "PD");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const next = profile.settings?.plugins?.["builtin.jira-links"];
    setEnabled(next?.enabled ?? false);
    setBaseUrl(next?.baseUrl ?? DEFAULT_BASE_URL);
    setProjectKeys(next?.projectKeys?.join(", ") ?? "PD");
  }, [profile]);

  const save = async () => {
    setSaving(true);
    try {
      await updateSettings({
        ...profile.settings,
        plugins: {
          ...profile.settings?.plugins,
          "builtin.jira-links": {
            enabled,
            baseUrl: baseUrl.trim(),
            projectKeys: projectKeys.split(",").map((key) => key.trim()).filter(Boolean),
          },
        },
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack gap="md">
      <Switch label="Enable Jira links" checked={enabled} onChange={(event) => setEnabled(event.currentTarget.checked)} />
      <TextInput label="Issue URL" description="The URL before the issue key" value={baseUrl} onChange={(event) => setBaseUrl(event.currentTarget.value)} disabled={!enabled} />
      <TextInput label="Project keys" description="Comma-separated keys, for example PD, WEB" value={projectKeys} onChange={(event) => setProjectKeys(event.currentTarget.value)} disabled={!enabled} />
      <Group><Button onClick={() => void save()} loading={saving}>Save Jira settings</Button></Group>
    </Stack>
  );
};

const Root = () => null;

export const jiraLinksRendererModule: RendererModule = {
  id: "jira-links",
  Root,
  settings: [{
    id: "jira-links",
    title: "Jira links",
    description: "Turn issue keys in notes into links for this profile.",
    Panel: JiraLinksSettings,
  }],
};
