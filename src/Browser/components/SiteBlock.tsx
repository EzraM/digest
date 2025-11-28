import React, { useEffect, useRef } from "react";
import { createReactBlockSpec } from "@blocknote/react";
import { Page } from "./Page";
import { useDevToolsState } from "../../hooks/useDevToolsState";
import { useBrowserNavigationState } from "../../hooks/useBrowserNavigationState";
import { useCopyToClipboard } from "../../hooks/useCopyToClipboard";
import type { CustomBlockNoteEditor } from "../../types/schema";

// Define the prop schema with proper typing
const sitePropSchema = {
  url: {
    default: "" as const,
  },
  heightMode: {
    default: "normal" as const,
    values: ["normal", "expanded"] as const,
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
      const { block, editor } = props as typeof props & {
        editor: CustomBlockNoteEditor;
      };
      const { url, heightMode } = block.props;
      const { copied, copy: handleCopy } = useCopyToClipboard(url);
      const {
        isAvailable: devToolsAvailable,
        isOpen: devToolsOpen,
        isBusy: isTogglingDevTools,
        toggleDevTools,
      } = useDevToolsState(block.id);
      const { canGoBack, isNavigatingBack, goBack } =
        useBrowserNavigationState(block.id, editor, url);

      const containerRef = useRef<HTMLDivElement>(null);

      const toggleHeightMode = () => {
        editor.updateBlock(block, {
          type: "site",
          props: {
            ...block.props,
            heightMode: heightMode === "normal" ? "expanded" : "normal",
          },
        });
      };

      // Scroll into view when expanded
      useEffect(() => {
        if (heightMode === "expanded" && containerRef.current) {
          setTimeout(() => {
            containerRef.current?.scrollIntoView({
              behavior: "smooth",
              block: "start",
            });
          }, 100); // Small delay to let height change take effect
        }
      }, [heightMode]);

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
          ref={containerRef}
          style={{
            border: "1px solid #e0e0e0",
            borderRadius: "8px",
            overflow: "hidden",
            backgroundColor: "#fff",
            position: "relative",
            width: "100%",
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
            <button
              type="button"
              onClick={goBack}
              disabled={!canGoBack || isNavigatingBack}
              style={{
                border: "1px solid #d0d0d0",
                backgroundColor: "#fff",
                color: canGoBack ? "#333" : "#bbb",
                borderRadius: "4px",
                padding: "2px 8px",
                cursor:
                  !canGoBack || isNavigatingBack ? "not-allowed" : "pointer",
                fontSize: "12px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                minWidth: "36px",
              }}
              title={
                canGoBack ? "Go back" : "No previous page available"
              }
              aria-disabled={!canGoBack}
            >
              {isNavigatingBack ? "⏳" : "←"}
            </button>
            <button
              type="button"
              onClick={toggleHeightMode}
              style={{
                border: "1px solid #d0d0d0",
                backgroundColor: heightMode === "expanded" ? "#e7f5ff" : "#fff",
                color: heightMode === "expanded" ? "#1c7ed6" : "#333",
                borderRadius: "4px",
                padding: "2px 8px",
                cursor: "pointer",
                fontSize: "12px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                minWidth: "36px",
              }}
              title={heightMode === "expanded" ? "Collapse" : "Expand"}
              aria-label={heightMode === "expanded" ? "Collapse block" : "Expand block"}
            >
              {heightMode === "expanded" ? "⊟" : "⊞"}
            </button>
            <span aria-hidden="true">🌐</span>
            <button
              type="button"
              onClick={handleCopy}
              style={{
                flex: 1,
                fontFamily: "monospace",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                userSelect: "text",
                background: "none",
                border: "none",
                padding: 0,
                textAlign: "left",
                cursor: "pointer",
                color: "#333",
              }}
              title={copied ? "Copied!" : "Copy link"}
              aria-label={copied ? "Copied link" : "Copy link"}
            >
              {url}
            </button>
            {devToolsAvailable && (
              <button
                type="button"
                onClick={toggleDevTools}
                disabled={isTogglingDevTools}
                aria-pressed={devToolsOpen}
                style={{
                  border: "1px solid #d0d0d0",
                  backgroundColor: devToolsOpen ? "#e7f5ff" : "#fff",
                  color: devToolsOpen ? "#1c7ed6" : "#333",
                  borderRadius: "4px",
                  padding: "4px 8px",
                  cursor: isTogglingDevTools ? "wait" : "pointer",
                  fontSize: "12px",
                }}
                title={
                  devToolsOpen ? "Close developer tools" : "Open developer tools"
                }
              >
                {isTogglingDevTools
                  ? "…"
                  : devToolsOpen
                  ? "Close DevTools"
                  : "Open DevTools"}
              </button>
            )}
          </div>

          {/* Browser content */}
          <Page blockId={block.id} url={url} heightMode={heightMode} />
        </div>
      );
    },
  }
);

// Export the type for other parts of the application
export type SiteBlockSpec = typeof site;
