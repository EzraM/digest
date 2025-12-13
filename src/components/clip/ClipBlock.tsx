import { createReactBlockSpec } from "@blocknote/react";
import { Box } from "@mantine/core";
import type { CustomBlockNoteEditor } from "../../types/schema";

// Define the prop schema
const clipPropSchema = {
  sourceUrl: {
    default: "" as const,
  },
  title: {
    default: "" as const,
  },
} as const;

/**
 * Clip block: a container block that holds clipped content with provenance
 * - Inline content: The reference URL/title (editable text/link)
 * - Children: The actual clipped content blocks (paragraph/heading/list/etc)
 */
export const clip = createReactBlockSpec(
  {
    type: "clip" as const,
    propSchema: clipPropSchema,
    content: "inline", // Inline content for the reference URL
  },
  {
    render: (props) => {
      const { block, editor, contentRef } = props as typeof props & {
        editor: CustomBlockNoteEditor;
      };

      return (
        <Box className="clip-block-container">
          {/* Inline content editor for the reference URL */}
          <Box
            ref={contentRef}
            className="bn-default-styles"
            style={{
              marginBottom: "8px",
              paddingBottom: "8px",
              borderBottom: "1px solid var(--mantine-color-default-border)",
              fontSize: "12px",
              color: "var(--mantine-color-dimmed)",
              outline: "none",
              minHeight: "20px",
            }}
          />

          {/* Children blocks are rendered automatically by BlockNote after this component */}
        </Box>
      );
    },
  }
);


