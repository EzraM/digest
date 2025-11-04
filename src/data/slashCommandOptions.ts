import { SlashCommandOption } from "../types/slashCommand";

export const slashCommandOptions: SlashCommandOption[] = [
  {
    badge: "⌘-Alt-1",
    key: "heading",
    title: "Heading 1",
    subtext: "Used for a top-level heading",
    aliases: ["h", "heading1", "h1"],
    group: "Headings",
  },
  {
    badge: "⌘-Alt-2",
    key: "heading_2",
    title: "Heading 2",
    subtext: "Used for key sections",
    aliases: ["h2", "heading2", "subheading"],
    group: "Headings",
  },
  {
    badge: "⌘-Alt-3",
    key: "heading_3",
    title: "Heading 3",
    subtext: "Used for subsections and group headings",
    aliases: ["h3", "heading3", "subheading"],
    group: "Headings",
  },
  {
    badge: "⌘-Shift-7",
    key: "numbered_list",
    title: "Numbered List",
    subtext: "Used to display a numbered list",
    aliases: ["ol", "li", "list", "numberedlist", "numbered list"],
    group: "Basic blocks",
  },
  {
    badge: "⌘-Shift-8",
    key: "bullet_list",
    title: "Bullet List",
    subtext: "Used to display an unordered list",
    aliases: ["ul", "li", "list", "bulletlist", "bullet list"],
    group: "Basic blocks",
  },
  {
    badge: "⌘-Shift-9",
    key: "check_list",
    title: "Check List",
    subtext: "Used to display a list with checkboxes",
    aliases: [
      "ul",
      "li",
      "list",
      "checklist",
      "check list",
      "checked list",
      "checkbox",
    ],
    group: "Basic blocks",
  },
  {
    badge: "⌘-Alt-0",
    key: "paragraph",
    title: "Paragraph",
    subtext: "Used for the body of your document",
    aliases: ["p", "paragraph"],
    group: "Basic blocks",
  },
  {
    key: "table",
    title: "Table",
    subtext: "Used for tables",
    aliases: ["table"],
    group: "Advanced",
  },
  {
    key: "image",
    title: "Image",
    subtext: "Insert an image",
    aliases: [
      "image",
      "imageUpload",
      "upload",
      "img",
      "picture",
      "media",
      "url",
    ],
    group: "Media",
  },
  {
    key: "video",
    title: "Video",
    subtext: "Insert a video",
    aliases: [
      "video",
      "videoUpload",
      "upload",
      "mp4",
      "film",
      "media",
      "url",
    ],
    group: "Media",
  },
  {
    key: "audio",
    title: "Audio",
    subtext: "Insert audio",
    aliases: [
      "audio",
      "audioUpload",
      "upload",
      "mp3",
      "sound",
      "media",
      "url",
    ],
    group: "Media",
  },
  {
    key: "file",
    title: "File",
    subtext: "Insert a file",
    aliases: ["file", "upload", "embed", "media", "url"],
    group: "Media",
  },
  {
    key: "google_search",
    title: "Google Search",
    subtext: "Search Google and view results",
    aliases: ["g", "google", "search"],
    group: "Media",
  },
  {
    key: "chatgpt",
    title: "ChatGPT",
    subtext: "Start a ChatGPT conversation from a prompt",
    aliases: ["c", "chat", "gpt", "chatgpt"],
    group: "Media",
  },
  {
    key: "url",
    title: "URL",
    subtext: "Load a URL in an embedded browser",
    aliases: ["l", "location", "url"],
    group: "Media",
  },
];

export const filterSlashCommandOptions = (
  query: string,
  options: SlashCommandOption[] = slashCommandOptions,
): SlashCommandOption[] => {
  const search = query.trim().toLowerCase();
  if (!search) {
    return options;
  }

  return options.filter((option) => {
    const titleMatch = option.title.toLowerCase().includes(search);
    const subtextMatch = option.subtext?.toLowerCase().includes(search);
    const aliasMatch = option.aliases?.some((alias) => {
      const normalized = alias.toLowerCase();
      return normalized === search || normalized.includes(search);
    });

    return Boolean(titleMatch || subtextMatch || aliasMatch);
  });
};
