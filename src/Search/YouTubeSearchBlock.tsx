import { useCallback, useEffect } from "react";
import { createReactBlockSpec } from "@blocknote/react";
import { createExtension } from "@blocknote/core";
import { Button } from "@mantine/core";
import type {
  CustomBlockNoteEditor,
  CustomBlock,
} from "../types/schema";
import { useAppRoute } from "../context/AppRouteContext";
import { SearchBlockShell } from "./SearchBlockShell";

export const YouTubeSearchExtensionName = "digest-youtube-search";
const navigators = new WeakMap<object, (url: string) => void>();

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
  editor: CustomBlockNoteEditor,
  navigateToUrl = navigators.get(editor)
): void {
  const trimmedQuery = query.trim();
  if (!trimmedQuery || !navigateToUrl) return;

  const youtubeUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(trimmedQuery)}`;

  // The prompt is temporary: remove it from the notebook before opening YouTube.
  editor.removeBlocks([block.id]);
  navigateToUrl(youtubeUrl);
}

const youtubeSearchExtension = createExtension({
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
      const { navigateToUrl } = useAppRoute();

      useEffect(() => {
        navigators.set(editor, navigateToUrl);
        return () => {
          if (navigators.get(editor) === navigateToUrl) {
            navigators.delete(editor);
          }
        };
      }, [editor, navigateToUrl]);

      const handleSearch = useCallback(() => {
        executeYouTubeSearch(
          getPlainText(block.content as InlineContentItem[]),
          block as CustomBlock,
          editor as unknown as CustomBlockNoteEditor,
          navigateToUrl
        );
      }, [block, editor, navigateToUrl]);

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
