import React from "react";
import { createReactBlockSpec } from "@blocknote/react";
import { Page } from "./Page";

// Define the prop schema with proper typing
const sitePropSchema = {
  url: {
    default: "" as const,
  },
} as const;

// Create a type-safe site block spec
export const site = createReactBlockSpec(
  {
    type: "site" as const,
    propSchema: sitePropSchema,
    content: "none", // No inline content - we display the browser page
  },
  {
    render: (props) => {
      const { block } = props;
      const { url } = block.props;

      // Site blocks must always have a URL - if not, show an error
      if (!url) {
        return (
          <div
            style={{
              border: "2px solid #ff6b6b",
              borderRadius: "8px",
              padding: "12px",
              backgroundColor: "#fff5f5",
              color: "#c92a2a",
              fontSize: "14px",
            }}
          >
            ⚠️ Site block requires a URL. This block should be created
            programmatically with a URL.
          </div>
        );
      }

      return (
        <div
          style={{
            border: "1px solid #e0e0e0",
            borderRadius: "8px",
            overflow: "hidden",
            backgroundColor: "#fff",
            position: "relative",
          }}
        >
          {/* Read-only URL bar */}
          <div
            style={{
              padding: "8px 12px",
              backgroundColor: "#f8f9fa",
              borderBottom: "1px solid #e0e0e0",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              fontSize: "12px",
              color: "#666",
            }}
          >
            <span>🌐</span>
            <span style={{ flex: 1, fontFamily: "monospace" }}>{url}</span>
          </div>

          {/* Browser content */}
          <Page blockId={block.id} url={url} />
        </div>
      );
    },
  }
);

// Export the type for other parts of the application
export type SiteBlockSpec = typeof site;
