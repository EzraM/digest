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

export const ChatGPTExtensionName = "digest-chatgpt";
const ChatGPTBlockTypes = new Set([ChatGPTExtensionName, "chatGPT"]);

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

function executeChatGPTQuery(
  query: string,
  block: CustomBlock,
  editor: CustomBlockNoteEditor
): void {
  if (!query.trim()) {
    return;
  }

  const encodedQuery = encodeURIComponent(query.trim());
  const chatGPTUrl = `https://chatgpt.com/?q=${encodedQuery}`;

  // Replace the query block with a site block in place
  editor.updateBlock(block, {
    type: "site",
    props: { url: chatGPTUrl },
    content: undefined,
  } as unknown as CustomPartialBlock);
}

// Extension for handling Enter key in ChatGPTBlock
const chatGPTExtension = createBlockNoteExtension({
  key: "digest-chatgpt-enter",
  keyboardShortcuts: {
    Enter: ({ editor }: { editor: CustomBlockNoteEditor }) => {
      const { block } = editor.getTextCursorPosition();
      if (!ChatGPTBlockTypes.has(block.type)) {
        return false; // Let other handlers process
      }

      // Extract content and execute query
      const query = getPlainTextFromInlineContent(
        block.content as InlineContentItem[]
      );
      if (query.trim()) {
        executeChatGPTQuery(query, block as CustomBlock, editor);
        return true; // Prevent default Enter behavior
      }

      return false; // Let default Enter behavior handle empty query
    },
  },
});

// Create a type-safe ChatGPT block spec
export const ChatGPT = createReactBlockSpec(
  {
    type: ChatGPTExtensionName,
    propSchema: {},
    content: "inline", // Use inline content so users can type directly
  },
  {
    render: (props) => {
      const { block, editor, contentRef } = props;

      const handleQuery = useCallback(() => {
        // Extract the plain text from the block's inline content
        const query = getPlainTextFromInlineContent(
          block.content as InlineContentItem[]
        );

        executeChatGPTQuery(query, block as CustomBlock, editor);
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
              onClick={handleQuery}
              style={{
                textTransform: "none",
                fontWeight: 500,
              }}
            >
              ChatGPT
            </Button>
          }
        />
      );
    },
  },
  [
    // Add the extension for Enter key handling
    chatGPTExtension,
  ]
);

// Export the type for other parts of the application
export type ChatGPTBlockSpec = typeof ChatGPT;
