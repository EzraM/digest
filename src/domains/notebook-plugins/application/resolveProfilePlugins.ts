import { ProfileSettings } from "../../../types/documents";
import { jiraLinksPlugin } from "../builtins/jira-links/JiraLinksPlugin";
import { EnabledNotebookPlugin } from "../core/types";

export const resolveProfilePlugins = (
  settings: ProfileSettings | null | undefined
): EnabledNotebookPlugin[] => {
  const jira = settings?.plugins?.["builtin.jira-links"];
  return jira?.enabled ? [{ plugin: jiraLinksPlugin, settings: jira }] : [];
};
