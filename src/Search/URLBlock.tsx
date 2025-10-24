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

export const URLExtensionName = "Digest/URL";
const URLBlockTypes = new Set([URLExtensionName, "url"]);

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
  editor: CustomBlockNoteEditor
): void {
  if (!url.trim()) {
    return;
  }

  let finalUrl = url.trim();

  // Add https:// protocol if no protocol is specified
  if (!finalUrl.match(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//)) {
    finalUrl = `https://${finalUrl}`;
  }

  // Replace the URL block with a site block in place
  editor.updateBlock(block, {
    type: "site",
    props: { url: finalUrl },
    content: undefined,
  } as unknown as CustomPartialBlock);
}

// Extension for handling Enter key in URLBlock
const urlExtension = createBlockNoteExtension({
  key: "Digest/URL/Enter",
  keyboardShortcuts: {
    Enter: ({ editor }: { editor: CustomBlockNoteEditor }) => {
      const { block } = editor.getTextCursorPosition();
      if (!URLBlockTypes.has(block.type)) {
        return false; // Let other handlers process
      }

      // Extract content and execute URL load
      const url = getPlainTextFromInlineContent(
        block.content as InlineContentItem[]
      );
      if (url.trim()) {
        executeURLLoad(url, block as CustomBlock, editor);
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

      const handleLoad = useCallback(() => {
        // Extract the plain text from the block's inline content
        const url = getPlainTextFromInlineContent(
          block.content as InlineContentItem[]
        );

        executeURLLoad(url, block as CustomBlock, editor);
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
