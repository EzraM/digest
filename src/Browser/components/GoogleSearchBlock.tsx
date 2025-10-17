import React, { useEffect, useRef, useState } from "react";
import { createReactBlockSpec } from "@blocknote/react";
import { TextInput } from "@mantine/core";

// Create a type-safe google search block spec
export const googleSearch = createReactBlockSpec(
  {
    type: "googleSearch" as const,
    propSchema: {},
    content: "none", // No inline content - we display the input field
  },
  {
    render: (props) => {
      const { block, editor } = props;
      const [query, setQuery] = useState("");
      const inputRef = useRef<HTMLInputElement>(null);

      // Auto-focus the input when the block is created
      useEffect(() => {
        if (inputRef.current) {
          inputRef.current.focus();
        }
      }, []);

      const handleSubmit = () => {
        if (query.trim()) {
          const encodedQuery = encodeURIComponent(query.trim());
          const googleUrl = `https://www.google.com/search?q=${encodedQuery}`;

          // Replace this block with a site block containing the Google search URL
          editor.updateBlock(block.id, {
            type: "site",
            props: { url: googleUrl },
          });
        }
      };

      const handleKeyDown = (event: React.KeyboardEvent) => {
        if (event.key === "Enter") {
          event.preventDefault();
          handleSubmit();
        } else if (event.key === "Escape") {
          event.preventDefault();
          // Remove the block
          editor.removeBlocks([block.id]);
        }
      };

      return (
        <div
          style={{
            border: "1px solid #e0e0e0",
            borderRadius: "8px",
            padding: "12px",
            backgroundColor: "#f8f9fa",
            margin: "8px 0",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              marginBottom: "8px",
            }}
          >
            <span style={{ fontSize: "16px" }}>🔍</span>
            <span
              style={{
                fontSize: "14px",
                fontWeight: 500,
                color: "#666",
              }}
            >
              Google Search
            </span>
          </div>
          <TextInput
            ref={inputRef}
            placeholder="Enter your search query..."
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            onKeyDown={handleKeyDown}
            size="sm"
            styles={{
              input: {
                fontSize: "14px",
                border: "1px solid #d0d0d0",
                "&:focus": {
                  borderColor: "#1976d2",
                  boxShadow: "0 0 0 2px rgba(25, 118, 210, 0.2)",
                },
              },
            }}
          />
          <div
            style={{
              fontSize: "12px",
              color: "#888",
              marginTop: "4px",
            }}
          >
            Press Enter to search • Press Escape to cancel
          </div>
        </div>
      );
    },
  }
);

// Export the type for other parts of the application
export type GoogleSearchBlockSpec = typeof googleSearch;
