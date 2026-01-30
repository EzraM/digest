import { createReactBlockSpec } from "@blocknote/react";
import { useCopyToClipboard } from "../../hooks/useCopyToClipboard";
import { useDocumentContext } from "../../context/DocumentContext";
import { useAppRoute } from "../../context/AppRouteContext";

// Define the prop schema with proper typing
const sitePropSchema = {
  url: {
    default: "" as const,
  },
  scrollPercent: {
    default: undefined as number | undefined,
  },
} as const;

// Create a type-safe site block spec
export const site = createReactBlockSpec(
  {
    type: "site" as const,
    propSchema: sitePropSchema,
    content: "none", // No inline content - clicking opens full page view
  },
  {
    render: (props) => {
      const { block } = props;
      const { url } = block.props;
      const { copied, copy: handleCopy } = useCopyToClipboard(url);
      const { documentId } = useDocumentContext();
      const { navigateToBlock } = useAppRoute();

      const openInFullView = () => {
        navigateToBlock(block.id, documentId ?? undefined);
      };

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
            Site block requires a URL. This block should be created
            programmatically with a URL.
          </div>
        );
      }

      return (
        <div
          id={`site-block-${block.id}`}
          onClick={openInFullView}
          style={{
            border: "1px solid #e0e0e0",
            borderRadius: "8px",
            padding: "8px 12px",
            backgroundColor: "#fff",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            fontSize: "12px",
            transition: "background-color 0.15s ease",
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.backgroundColor = "#f8f9fa")
          }
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#fff")}
        >
          <span aria-hidden="true">🌐</span>
          <span
            style={{
              flex: 1,
              fontFamily: "monospace",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              color: "#333",
            }}
          >
            {url}
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleCopy();
            }}
            style={{
              border: "1px solid #d0d0d0",
              backgroundColor: "#fff",
              color: "#333",
              borderRadius: "4px",
              padding: "2px 8px",
              cursor: "pointer",
              fontSize: "12px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              minWidth: "36px",
            }}
            title={copied ? "Copied!" : "Copy link"}
            aria-label={copied ? "Copied link" : "Copy link"}
          >
            {copied ? "✓" : "🔗"}
          </button>
          <span style={{ color: "#666" }}>→</span>
        </div>
      );
    },
  }
);

// Export the type for other parts of the application
export type SiteBlockSpec = typeof site;
