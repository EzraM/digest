import type { JiraLinksPluginSettings } from "../../../../types/documents";
import type {
  NotebookPlugin,
  PortableInlineContent,
} from "../../core/types";

const DEFAULT_BASE_URL = "https://learning-ally.atlassian.net/browse";

export const linkJiraReferences = (
  item: Extract<PortableInlineContent, { type: "text" }>,
  settings: JiraLinksPluginSettings
): PortableInlineContent[] => {
  if (item.styles?.code || !item.text) return [item];

  const projectKeys = settings.projectKeys?.map((key) => key.toUpperCase());
  // Requiring a trailing delimiter avoids linking PD-3 while PD-3662 is typed.
  const pattern = /\b([A-Za-z][A-Za-z0-9]+)-(\d+)\b(?=[^A-Za-z0-9-])/g;
  const result: PortableInlineContent[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(item.text)) !== null) {
    const projectKey = match[1].toUpperCase();
    if (projectKeys && !projectKeys.includes(projectKey)) continue;

    if (match.index > cursor) {
      result.push({ ...item, text: item.text.slice(cursor, match.index) });
    }

    const ticket = `${projectKey}-${match[2]}`;
    result.push({
      type: "link",
      href: `${settings.baseUrl.replace(/\/$/, "")}/${ticket}`,
      content: [{ ...item, text: match[0] }],
    });
    cursor = match.index + match[0].length;
  }

  if (cursor === 0) return [item];
  if (cursor < item.text.length) {
    result.push({ ...item, text: item.text.slice(cursor) });
  }
  return result;
};

export const jiraLinksPlugin: NotebookPlugin<JiraLinksPluginSettings> = {
  manifest: {
    id: "builtin.jira-links",
    name: "Jira ticket links",
    version: "1.0.0",
  },
  activate({ settings }) {
    const resolved = { ...settings, baseUrl: settings.baseUrl || DEFAULT_BASE_URL };
    return {
      onTransaction(event) {
        return event.blocks.flatMap((block) => {
          if (!block.content) return [];
          const content = block.content.flatMap((item) =>
            item.type === "text" ? linkJiraReferences(item, resolved) : [item]
          );
          return JSON.stringify(content) === JSON.stringify(block.content)
            ? []
            : [{ type: "set-inline-content" as const, blockId: block.id, content }];
        });
      },
    };
  },
};
