import React, { useState, useRef, useEffect } from "react";
import { createReactBlockSpec } from "@blocknote/react";
import { Page } from "./Page";
import { BlockInserter } from "../../services/BlockInserter";

type SiteStatus = "entry" | "page";

export const site = createReactBlockSpec(
  {
    type: "site",
    propSchema: {
      url: { default: "" },
    },
    content: "none", // No inline content - we'll handle our own input
  },
  {
    render: (props) => {
      const { block, editor } = props;
      const { url } = block.props;
      const [inputValue, setInputValue] = useState(url || "");
      const [blockInserter] = useState(() => new BlockInserter(editor));
      const textareaRef = useRef<HTMLTextAreaElement>(null);

      // Determine the effective status: if we have a URL, show page, otherwise show entry
      const effectiveStatus: SiteStatus = url ? "page" : "entry";

      // Focus the input when the block is created (only for entry mode)
      useEffect(() => {
        if (effectiveStatus === "entry" && textareaRef.current) {
          // Small delay to ensure the block is fully rendered
          setTimeout(() => {
            textareaRef.current?.focus();
          }, 100);
        }
      }, [effectiveStatus]);

      // Check if input is a direct URL
      const isDirectUrl = (input: string): boolean => {
        return (
          input.trim().startsWith("http://") ||
          input.trim().startsWith("https://")
        );
      };

      // Handle processing input
      const handleProcessInput = async (input: string) => {
        const trimmedInput = input.trim();
        if (!trimmedInput) return;

        try {
          // If it's a direct URL, navigate directly
          if (isDirectUrl(trimmedInput)) {
            console.log("[SiteBlock] Direct URL navigation to:", trimmedInput);
            editor.updateBlock(block, {
              type: "site",
              props: {
                url: trimmedInput,
              },
            });
            return;
          }

          // Otherwise, send to Claude for intelligent processing
          console.log("[SiteBlock] Processing with Claude:", trimmedInput);

          // Check if intelligent processing is available
          const isAvailable = await (
            window.electronAPI as any
          )?.isBlockCreationAvailable?.();

          if (!isAvailable) {
            console.log("[SiteBlock] Intelligent processing not available");
            // Could show an error or fallback behavior here
            return;
          }

          // Process input and get block creation requests
          const result = await (
            window.electronAPI as any
          )?.processInputCreateBlocks?.(trimmedInput);

          if (!result?.success || !result.blocks) {
            console.log("[SiteBlock] Block creation failed:", result?.error);
            return;
          }

          console.log(
            "[SiteBlock] Received blocks to create:",
            JSON.stringify(result.blocks, null, 2)
          );

          // Replace current block with first block and insert remaining blocks
          if (result.blocks.length > 0) {
            const firstBlock = result.blocks[0];
            editor.updateBlock(block, {
              type: firstBlock.type,
              props: firstBlock.props || {},
              content: firstBlock.content,
            });

            // Insert remaining blocks after this one
            if (result.blocks.length > 1) {
              const remainingBlocks = result.blocks.slice(1);
              await blockInserter.insertBlocks(remainingBlocks, {
                staggerDelay: 150,
              });
            }
          }
        } catch (error) {
          console.error("[SiteBlock] Error processing input:", error);
        }
      };

      const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
          if (e.metaKey || e.ctrlKey) {
            // Cmd/Ctrl+Enter for processing
            e.preventDefault();
            handleProcessInput(inputValue);
          }
          // Regular Enter allows line break (default textarea behavior)
        }
      };

      const handleEditUrl = () => {
        setInputValue(url || "");
        editor.updateBlock(block, {
          type: "site",
          props: {
            url: "",
          },
        });
      };

      // Render based on status
      switch (effectiveStatus) {
        case "entry":
          return (
            <div
              style={{
                border: "2px solid #e0e0e0",
                borderRadius: "8px",
                padding: "12px",
                backgroundColor: "#fafafa",
                minHeight: "80px",
                display: "flex",
                alignItems: "flex-start",
                gap: "8px",
              }}
            >
              <div style={{ fontSize: "18px", marginTop: "4px" }}>🌐</div>
              <div style={{ flex: 1 }}>
                <textarea
                  ref={textareaRef}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Enter URL or describe what you're looking for..."
                  style={{
                    width: "100%",
                    border: "none",
                    background: "transparent",
                    fontSize: "14px",
                    outline: "none",
                    color: "#333",
                    resize: "none",
                    minHeight: "20px",
                    fontFamily: "inherit",
                  }}
                  rows={1}
                />
                <div
                  style={{ fontSize: "12px", color: "#666", marginTop: "4px" }}
                >
                  ⌘+Enter to process • Enter for line break
                </div>
              </div>
            </div>
          );

        case "page":
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
              {/* URL bar */}
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
                <button
                  onClick={handleEditUrl}
                  style={{
                    background: "none",
                    border: "1px solid #ddd",
                    borderRadius: "4px",
                    padding: "2px 6px",
                    cursor: "pointer",
                    fontSize: "11px",
                  }}
                  title="Edit URL"
                >
                  ✏️
                </button>
              </div>

              {/* Browser content */}
              <Page blockId={block.id} url={url} />
            </div>
          );

        default:
          return <div>Unknown status</div>;
      }
    },
  }
);
