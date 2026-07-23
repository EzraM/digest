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

export const URLExtensionName = "digest-url";
const URLBlockTypes = new Set([URLExtensionName, "url"]);
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

function executeURLLoad(
  url: string,
  block: CustomBlock,
  editor: CustomBlockNoteEditor,
  navigateToUrl = navigators.get(editor)
): void {
  if (!url.trim() || !navigateToUrl) {
    return;
  }

  let finalUrl = url.trim();

  // Add https:// protocol if no protocol is specified
  if (!finalUrl.match(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//)) {
    finalUrl = `https://${finalUrl}`;
  }

  // The URL prompt is temporary. The opened page is saved only via the rail +.
  editor.removeBlocks([block.id]);
  navigateToUrl(finalUrl);
}

// Extension for handling Enter key in URLBlock
const urlExtension = createExtension({
  key: "digest-url-enter",
  keyboardShortcuts: {
    Enter: ({ editor }) => {
      const customEditor = editor as unknown as CustomBlockNoteEditor;
      const { block } = customEditor.getTextCursorPosition();
      if (!URLBlockTypes.has(block.type)) {
        return false; // Let other handlers process
      }

      // Extract content and execute URL load
      const url = getPlainTextFromInlineContent(
        block.content as InlineContentItem[]
      );
      if (url.trim()) {
        executeURLLoad(url, block as CustomBlock, customEditor);
        return true; // Prevent default Enter behavior
      }

      return false; // Let default Enter behavior handle empty URL
    },
  },
});

// Create a type-safe URL block spec
export const URL = createReactBlockSpec(
  {
    type: URLExtensionName,
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

      const handleLoad = useCallback(() => {
        // Extract the plain text from the block's inline content
        const url = getPlainTextFromInlineContent(
          block.content as InlineContentItem[]
        );

        executeURLLoad(
          url,
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
              onClick={handleLoad}
              style={{
                textTransform: "none",
                fontWeight: 500,
              }}
            >
              URL
            </Button>
          }
        />
      );
    },
  },
  [
    // Add the extension for Enter key handling
    urlExtension,
  ]
);

// Export the type for other parts of the application
export type URLBlockSpec = typeof URL;
