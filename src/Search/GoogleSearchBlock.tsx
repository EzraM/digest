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

export const GoogleSearchExtensionName = "Digest/GoogleSearch";

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
  editor: CustomBlockNoteEditor
): void {
  if (!query.trim()) {
    return;
  }

  const encodedQuery = encodeURIComponent(query.trim());
  const googleUrl = `https://www.google.com/search?q=${encodedQuery}`;

  // Replace the search block with a site block in place
  editor.updateBlock(block, {
    type: "site",
    props: { url: googleUrl },
    content: undefined,
  } as unknown as CustomPartialBlock);
}

// Extension for handling Enter key in GoogleSearchBlock
const googleSearchExtension = createBlockNoteExtension({
  key: "Digest/GoogleSearch/Enter",
  keyboardShortcuts: {
    Enter: ({ editor }: { editor: CustomBlockNoteEditor }) => {
      const { block } = editor.getTextCursorPosition();
      if (block.type !== GoogleSearchExtensionName) {
        return false; // Let other handlers process
      }

      // Extract content and execute search
      const query = getPlainTextFromInlineContent(
        block.content as InlineContentItem[]
      );
      if (query.trim()) {
        executeGoogleSearch(query, block as CustomBlock, editor);
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

      const handleSearch = useCallback(() => {
        // Extract the plain text from the block's inline content
        const query = getPlainTextFromInlineContent(
          block.content as InlineContentItem[]
        );

        // Use the well-factored search execution logic
        executeGoogleSearch(query, block as CustomBlock, editor);
      }, [block, editor]);

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
