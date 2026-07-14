import { useCallback } from "react";
import { createReactBlockSpec } from "@blocknote/react";
import { createBlockNoteExtension } from "@blocknote/core";
import { Button } from "@mantine/core";
import type {
  CustomBlockNoteEditor,
  CustomBlock,
  CustomPartialBlock,
} from "../types/schema";
import { SearchBlockShell } from "./SearchBlockShell";

export const YouTubeSearchExtensionName = "digest-youtube-search";

interface InlineContentItem {
  type: string;
  text?: string;
  [key: string]: unknown;
}

function getPlainText(content: InlineContentItem[]): string {
  if (!Array.isArray(content)) return "";
  return content
    .filter((item) => item.type === "text")
    .map((item) => item.text || "")
    .join("");
}

function executeYouTubeSearch(
  query: string,
  block: CustomBlock,
  editor: CustomBlockNoteEditor
): void {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return;

  const youtubeUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(trimmedQuery)}`;
  editor.updateBlock(block, {
    type: "site",
    props: { url: youtubeUrl },
    content: undefined,
  } as unknown as CustomPartialBlock);
}

const youtubeSearchExtension = createBlockNoteExtension({
  key: "digest-youtube-search-enter",
  keyboardShortcuts: {
    Enter: ({ editor }) => {
      const customEditor = editor as unknown as CustomBlockNoteEditor;
      const { block } = customEditor.getTextCursorPosition();
      if (block.type !== YouTubeSearchExtensionName) return false;

      const query = getPlainText(block.content as InlineContentItem[]);
      if (!query.trim()) return false;

      executeYouTubeSearch(query, block as CustomBlock, customEditor);
      return true;
    },
  },
});

export const YouTubeSearch = createReactBlockSpec(
  {
    type: YouTubeSearchExtensionName,
    propSchema: {},
    content: "inline",
  },
  {
    render: ({ block, editor, contentRef }) => {
      const handleSearch = useCallback(() => {
        executeYouTubeSearch(
          getPlainText(block.content as InlineContentItem[]),
          block as CustomBlock,
          editor as unknown as CustomBlockNoteEditor
        );
      }, [block, editor]);

      return (
        <SearchBlockShell
          contentRef={contentRef}
          action={
            <Button
              size="xs"
              variant="light"
              radius="xl"
              color="red"
              onClick={handleSearch}
              style={{ textTransform: "none", fontWeight: 500 }}
            >
              YouTube
            </Button>
          }
        />
      );
    },
  },
  [youtubeSearchExtension]
);

export type YouTubeSearchBlockSpec = typeof YouTubeSearch;
