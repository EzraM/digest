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

export const GoogleSearchExtensionName = "digest-google-search";
const navigators = new WeakMap<object, (url: string) => void>();

// Type for inline content items
interface InlineContentItem {
  type: string;
  text?: string;
  [key: string]: unknown;
}

// Helper function to extract plain text from inline content
function getPlainTextFromInlineContent(content: InlineContentItem[]): string {
  if (!content || !Array.isArray(content)) {
    return "";
  }

  return content
    .filter((item) => item.type === "text")
    .map((item) => item.text || "")
    .join("");
}

function executeGoogleSearch(
  query: string,
  block: CustomBlock,
  editor: CustomBlockNoteEditor,
  navigateToUrl = navigators.get(editor)
): void {
  if (!query.trim() || !navigateToUrl) {
    return;
  }

  const encodedQuery = encodeURIComponent(query.trim());
  const googleUrl = `https://www.google.com/search?q=${encodedQuery}`;

  // The prompt is temporary: remove it from the notebook before opening Google.
  editor.removeBlocks([block.id]);
  navigateToUrl(googleUrl);
}

// Extension for handling Enter key in GoogleSearchBlock
const googleSearchExtension = createExtension({
  key: "digest-google-search-enter",
  keyboardShortcuts: {
    Enter: ({ editor }) => {
      const customEditor = editor as unknown as CustomBlockNoteEditor;
      const { block } = customEditor.getTextCursorPosition();
      if (block.type !== GoogleSearchExtensionName) {
        return false; // Let other handlers process
      }

      // Extract content and execute search
      const query = getPlainTextFromInlineContent(
        block.content as InlineContentItem[]
      );
      if (query.trim()) {
        executeGoogleSearch(query, block as CustomBlock, customEditor);
        return true; // Prevent default Enter behavior
      }

      return false; // Let default Enter behavior handle empty search
    },
  },
});

// Create a type-safe google search block spec
export const GoogleSearch = createReactBlockSpec(
  {
    type: GoogleSearchExtensionName,
    propSchema: {},
    content: "inline", // Use inline content so users can type directly
  },
  {
    render: (props) => {
      const { block, editor, contentRef } = props;
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
        // Extract the plain text from the block's inline content
        const query = getPlainTextFromInlineContent(
          block.content as InlineContentItem[]
        );

        executeGoogleSearch(
          query,
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
              color="gray"
              onClick={handleSearch}
              style={{
                textTransform: "none",
                fontWeight: 500,
              }}
            >
              Google
            </Button>
          }
        />
      );
    },
  },
  [
    // Add the extension for Enter key handling
    googleSearchExtension,
  ]
);

// Export the type for other parts of the application
export type GoogleSearchBlockSpec = typeof GoogleSearch;
