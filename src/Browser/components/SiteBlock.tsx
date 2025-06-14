import React, { useState, useRef, useEffect } from "react";
import { createReactBlockSpec } from "@blocknote/react";
import { Page } from "./Page";

// Define the status type explicitly to avoid TypeScript confusion
type SiteStatus = "entry" | "page";

export const site = createReactBlockSpec(
  {
    type: "site",
    propSchema: {
      url: { default: "" },
      status: { default: "entry", values: ["entry", "page"] },
    },
    content: "none", // No inline content - we'll handle our own input
  },
  {
    render: (props) => {
      const { block, editor } = props;
      const { url, status } = block.props;
      const [inputValue, setInputValue] = useState(url || "");
      const inputRef = useRef<HTMLInputElement>(null);

      // Determine the effective status: if we have a URL but status is entry, treat as page
      const effectiveStatus: SiteStatus =
        url && status === "entry" ? "page" : (status as SiteStatus);

      // Focus the input when the block is created (only for true entry mode)
      useEffect(() => {
        if (effectiveStatus === "entry" && inputRef.current) {
          // Small delay to ensure the block is fully rendered
          setTimeout(() => {
            inputRef.current?.focus();
          }, 100);
        }
      }, [effectiveStatus]);

      // Debug logging
      console.log("[SiteBlock] Render:", {
        blockId: block.id,
        url,
        status,
        effectiveStatus,
        inputValue,
      });

      // Helper function to parse URL for display
      const parseUrlForDisplay = (url: string) => {
        try {
          const urlObj = new URL(url);
          const domain = urlObj.hostname;
          const path = urlObj.pathname + urlObj.search + urlObj.hash;
          return { domain, path: path === "/" ? "" : path };
        } catch {
          // If URL parsing fails, just show the whole URL as domain
          return { domain: url, path: "" };
        }
      };

      // If we have a URL (either explicitly in page mode or auto-detected), show the browser
      if (effectiveStatus === "page" && url) {
        console.log("[SiteBlock] Rendering Page component with:", {
          blockId: block.id,
          url,
        });
        const { domain, path } = parseUrlForDisplay(url);

        return (
          <div>
            {/* URL Display Bar */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                padding: "8px 12px",
                backgroundColor: "#f8f9fa",
                border: "1px solid #e9ecef",
                borderBottom: "none",
                borderRadius: "4px 4px 0 0",
                fontSize: "14px",
                fontFamily: "monospace",
                minHeight: "32px",
              }}
            >
              <span style={{ fontWeight: "bold", color: "#333" }}>
                {domain}
              </span>
              {path && (
                <span style={{ color: "#666", fontWeight: "normal" }}>
                  {path}
                </span>
              )}
            </div>
            {/* Browser Content */}
            <div style={{ borderRadius: "0 0 4px 4px", overflow: "hidden" }}>
              <Page blockId={block.id} url={url} />
            </div>
          </div>
        );
      }

      const handleNavigate = () => {
        if (inputValue.trim()) {
          const formatUrl = (url: string): string => {
            if (!url) return url;
            if (!url.match(/^[a-zA-Z]+:\/\//)) {
              return `https://${url}`;
            }
            return url;
          };

          const formattedUrl = formatUrl(inputValue.trim());
          console.log("[SiteBlock] Navigating to:", {
            originalUrl: inputValue,
            formattedUrl,
          });

          editor.updateBlock(block, {
            type: "site",
            props: {
              url: formattedUrl,
              status: "page",
            },
          });
        }
      };

      // If we're in entry mode, show the URL input
      return (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            padding: "12px",
            border: "1px solid #e0e0e0",
            borderRadius: "6px",
            backgroundColor: "#f9f9f9",
            maxWidth: "100%",
          }}
        >
          <span
            style={{
              fontWeight: "500",
              color: "#666",
              minWidth: "32px",
              fontSize: "14px",
            }}
          >
            URL:
          </span>
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleNavigate();
              }
            }}
            placeholder="Enter URL (e.g., example.com, github.com/user/repo)"
            style={{
              flex: 1,
              minWidth: "300px", // Minimum width for readability
              maxWidth: "600px", // Maximum width to prevent it from being too wide
              padding: "8px 12px",
              border: "1px solid #ccc",
              borderRadius: "4px",
              backgroundColor: "white",
              outline: "none",
              fontSize: "14px",
              fontFamily: "monospace", // Monospace for URLs
            }}
          />
          <button
            onClick={handleNavigate}
            style={{
              padding: "8px 16px",
              border: "1px solid #007acc",
              borderRadius: "4px",
              backgroundColor: "#007acc",
              color: "white",
              cursor: "pointer",
              fontSize: "14px",
              fontWeight: "500",
              minWidth: "60px",
              transition: "background-color 0.2s",
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.backgroundColor = "#005a9e";
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.backgroundColor = "#007acc";
            }}
          >
            Go
          </button>
        </div>
      );
    },
  }
);
