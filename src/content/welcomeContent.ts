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
      "Use the AI-powered prompt at the bottom of your screen to open pages and do research:",
  },
  {
    type: "bulletListItem",
    content: "Press Cmd+L to focus the prompt",
  },
  {
    type: "bulletListItem",
    content: "Enter a URL or describe what you're looking for",
  },
  {
    type: "bulletListItem",
    content: "Press Cmd+Enter to submit and let the AI help you",
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
  {
    type: "paragraph",
    content: "Try it now: Press Cmd+L and enter a topic you'd like to explore!",
  },
];
