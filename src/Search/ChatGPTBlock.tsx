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

export const ChatGPTExtensionName = "digest-chatgpt";
const ChatGPTBlockTypes = new Set([ChatGPTExtensionName, "chatGPT"]);
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

function executeChatGPTQuery(
  query: string,
  block: CustomBlock,
  editor: CustomBlockNoteEditor,
  navigateToUrl = navigators.get(editor)
): void {
  if (!query.trim() || !navigateToUrl) {
    return;
  }

  const encodedQuery = encodeURIComponent(query.trim());
  const chatGPTUrl = `https://chatgpt.com/?q=${encodedQuery}`;

  // The prompt is temporary: remove it from the notebook before opening ChatGPT.
  editor.removeBlocks([block.id]);
  navigateToUrl(chatGPTUrl);
}

// Extension for handling Enter key in ChatGPTBlock
const chatGPTExtension = createExtension({
  key: "digest-chatgpt-enter",
  keyboardShortcuts: {
    Enter: ({ editor }) => {
      const customEditor = editor as unknown as CustomBlockNoteEditor;
      const { block } = customEditor.getTextCursorPosition();
      if (!ChatGPTBlockTypes.has(block.type)) {
        return false; // Let other handlers process
      }

      // Extract content and execute query
      const query = getPlainTextFromInlineContent(
        block.content as InlineContentItem[]
      );
      if (query.trim()) {
        executeChatGPTQuery(query, block as CustomBlock, customEditor);
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
      const { navigateToUrl } = useAppRoute();

      useEffect(() => {
        navigators.set(editor, navigateToUrl);
        return () => {
          if (navigators.get(editor) === navigateToUrl) {
            navigators.delete(editor);
          }
        };
      }, [editor, navigateToUrl]);

      const handleQuery = useCallback(() => {
        // Extract the plain text from the block's inline content
        const query = getPlainTextFromInlineContent(
          block.content as InlineContentItem[]
        );

        executeChatGPTQuery(
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
