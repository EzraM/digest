import { useCallback } from "react";
import { createReactBlockSpec } from "@blocknote/react";
import { insertOrUpdateBlock, createBlockNoteExtension } from "@blocknote/core";
import { Button } from "@mantine/core";
import type {
  CustomBlockNoteEditor,
  CustomPartialBlock,
} from "../types/schema";

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

// Well-factored search execution logic
function executeGoogleSearch(
  query: string,
  blockId: string,
  editor: CustomBlockNoteEditor
): void {
  if (!query.trim()) {
    return;
  }

  const encodedQuery = encodeURIComponent(query.trim());
  const googleUrl = `https://www.google.com/search?q=${encodedQuery}`;

  // Remove the search block and insert a site block in its place
  editor.removeBlocks([blockId]);
  insertOrUpdateBlock(editor, {
    type: "site",
    props: { url: googleUrl },
  } as unknown as CustomPartialBlock);
}

// Extension for handling Enter key in GoogleSearchBlock
const googleSearchExtension = createBlockNoteExtension({
  key: "google-search-enter",
  keyboardShortcuts: {
    Enter: ({ editor }: { editor: CustomBlockNoteEditor }) => {
      const { block } = editor.getTextCursorPosition();
      if (block.type !== "googleSearch") {
        return false; // Let other handlers process
      }

      // Extract content and execute search
      const query = getPlainTextFromInlineContent(
        block.content as InlineContentItem[]
      );
      if (query.trim()) {
        executeGoogleSearch(query, block.id, editor);
        return true; // Prevent default Enter behavior
      }

      return false; // Let default Enter behavior handle empty search
    },
  },
});

// Create a type-safe google search block spec
export const googleSearch = createReactBlockSpec(
  {
    type: "googleSearch" as const,
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
        executeGoogleSearch(
          query,
          block.id,
          editor as unknown as CustomBlockNoteEditor
        );
      }, [block, editor]);

      return (
        <div
          style={{
            width: "100%",
            position: "relative",
            border: "1px solid #d0d0d0",
            borderRadius: "8px",
            padding: "12px 80px 12px 16px",
            backgroundColor: "#fff",
            minHeight: "44px",
            display: "flex",
            alignItems: "center",
          }}
        >
          <div
            ref={contentRef}
            style={{
              flex: 1,
              outline: "none",
            }}
          />
          <div
            style={{
              position: "absolute",
              right: "12px",
              top: "50%",
              transform: "translateY(-50%)",
            }}
          >
            <Button
              size="xs"
              variant="light"
              color="gray"
              onClick={handleSearch}
              styles={{
                root: {
                  textTransform: "none",
                  fontWeight: 500,
                },
              }}
            >
              Google
            </Button>
          </div>
        </div>
      );
    },
  },
  [
    // Add the extension for Enter key handling
    googleSearchExtension,
  ]
);

// Export the type for other parts of the application
export type GoogleSearchBlockSpec = typeof googleSearch;
