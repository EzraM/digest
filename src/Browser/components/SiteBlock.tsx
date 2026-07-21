import { createReactBlockSpec } from "@blocknote/react";
import { useDocumentContext } from "../../context/DocumentContext";
import { useAppRoute } from "../../context/AppRouteContext";
import { useIsLivePage } from "../livePageStore";

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
      const { documentId, profileId } = useDocumentContext();
      const { navigateToBlock } = useAppRoute();
      const isLive = useIsLivePage(profileId, url);

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
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              openInFullView();
            }
          }}
          role="link"
          tabIndex={0}
          style={{
            cursor: "pointer",
            display: "flex",
            alignItems: "baseline",
            gap: "7px",
            color: "#0066cc",
            textDecoration: "underline",
            textDecorationThickness: "from-font",
            textUnderlineOffset: "2px",
            overflowWrap: "anywhere",
          }}
          title={url}
        >
          {isLive && (
            <span
              aria-label="Page is kept live"
              title="Page is kept live"
              style={{
                width: "7px",
                height: "7px",
                borderRadius: "50%",
                backgroundColor: "#2f9e44",
                boxShadow: "0 0 0 1px rgba(47, 158, 68, 0.18)",
                flex: "0 0 auto",
              }}
            />
          )}
          <span style={{ overflowWrap: "anywhere" }}>{url}</span>
        </div>
      );
    },
  }
);

// Export the type for other parts of the application
export type SiteBlockSpec = typeof site;
