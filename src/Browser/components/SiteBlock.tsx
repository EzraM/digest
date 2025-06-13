import React, { useState, useRef, useEffect } from "react";
import { createReactBlockSpec } from "@blocknote/react";
import { Page } from "./Page";

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

      // Focus the input when the block is created
      useEffect(() => {
        if (status === "entry" && inputRef.current) {
          // Small delay to ensure the block is fully rendered
          setTimeout(() => {
            inputRef.current?.focus();
          }, 100);
        }
      }, [status]);

      // Debug logging
      console.log("[SiteBlock] Render:", {
        blockId: block.id,
        url,
        status,
        inputValue,
      });

      // If we're in page mode, show the browser
      if (status === "page" && url) {
        console.log("[SiteBlock] Rendering Page component with:", {
          blockId: block.id,
          url,
        });
        return (
          <div>
            <Page blockId={block.id} url={url} />
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
            gap: "8px",
            padding: "8px",
            border: "1px solid #e0e0e0",
            borderRadius: "4px",
            backgroundColor: "#f9f9f9",
          }}
        >
          <span style={{ fontWeight: "500", color: "#666" }}>URL:</span>
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
            placeholder="Enter URL (e.g., example.com)"
            style={{
              flex: 1,
              padding: "4px 8px",
              border: "1px solid #ccc",
              borderRadius: "3px",
              backgroundColor: "white",
              outline: "none",
              fontSize: "14px",
            }}
          />
          <button
            onClick={handleNavigate}
            style={{
              padding: "4px 8px",
              border: "1px solid #ccc",
              borderRadius: "3px",
              backgroundColor: "white",
              cursor: "pointer",
              fontSize: "14px",
            }}
          >
            Go
          </button>
        </div>
      );
    },
  }
);
