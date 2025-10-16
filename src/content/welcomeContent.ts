import { CustomPartialBlock } from "../types/schema";

export const welcomeContent: CustomPartialBlock[] = [
  {
    type: "heading",
    props: { level: 1 },
    content: "Welcome to Digest",
  },
  {
    type: "paragraph",
    content:
      "Digest helps you compress and refine information while exploring the internet. Build sharper, denser understanding over time.",
  },
  {
    type: "heading",
    props: { level: 2 },
    content: "Getting Started",
  },
  {
    type: "paragraph",
    content:
      "Use the HUD and slash commands to add content blocks as you explore:",
  },
  {
    type: "bulletListItem",
    content: "Type \"/\" to open the block menu and pick a block type",
  },
  {
    type: "bulletListItem",
    content: "Click any link to open it as an in-document browser block",
  },
  {
    type: "bulletListItem",
    content: "Capture notes, tables, and todos as you research",
  },
  {
    type: "paragraph",
    content:
      "Instead of endless browsing, you'll digest information—breaking it down, making connections, and distilling what matters into something you can actually use.",
  },
  {
    type: "paragraph",
    content:
      "Everything in this document is fully editable—delete, reorder, reword, and refine as you go. Make it yours.",
  },
];
