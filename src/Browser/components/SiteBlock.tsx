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
      const inputRef = useRef<HTMLInputElement>(null);

      // Determine the effective status: if we have a URL, show page, otherwise show entry
      const effectiveStatus: SiteStatus = url ? "page" : "entry";

      // Focus the input when the block is created (only for entry mode)
      useEffect(() => {
        if (effectiveStatus === "entry" && inputRef.current) {
          // Small delay to ensure the block is fully rendered
          setTimeout(() => {
            inputRef.current?.focus();
          }, 100);
        }
      }, [effectiveStatus]);

      // Handle intelligent navigation using the new block creation service
      const handleIntelligentNavigate = async (input: string) => {
        try {
          console.log(
            "[SiteBlock] Processing input with intelligent service:",
            input
          );

          // Check if intelligent processing is available
          const isAvailable =
            await window.electronAPI?.isBlockCreationAvailable();

          if (!isAvailable) {
            console.log(
              "[SiteBlock] Intelligent processing not available, using basic navigation"
            );
            handleBasicNavigate();
            return;
          }

          // Process input and get block creation requests
          const result = await window.electronAPI?.processInputCreateBlocks(
            input
          );

          if (!result?.success || !result.blocks) {
            console.log(
              "[SiteBlock] Block creation failed, falling back to basic navigation"
            );
            handleBasicNavigate();
            return;
          }

          console.log("[SiteBlock] Received blocks to create:", result.blocks);

          // If we got exactly one site block, just update this block
          if (result.blocks.length === 1 && result.blocks[0].type === "site") {
            const siteBlock = result.blocks[0];
            editor.updateBlock(block, {
              type: "site",
              props: {
                url: siteBlock.props?.url || input,
              },
            });
            return;
          }

          // Multiple blocks or non-site blocks - replace this block and insert others
          if (result.blocks.length > 0) {
            // Replace current block with first block
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
          console.error("[SiteBlock] Error in intelligent navigation:", error);
          handleBasicNavigate();
        }
      };

      const handleBasicNavigate = () => {
        if (inputValue.trim()) {
          const formatUrl = (url: string): string => {
            if (!url) return url;
            if (!url.match(/^[a-zA-Z]+:\/\//)) {
              return `https://${url}`;
            }
            return url;
          };

          const formattedUrl = formatUrl(inputValue.trim());
          console.log("[SiteBlock] Basic navigation to:", {
            originalUrl: inputValue,
            formattedUrl,
          });

          editor.updateBlock(block, {
            type: "site",
            props: {
              url: formattedUrl,
            },
          });
        }
      };

      const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
          e.preventDefault();
          if (e.metaKey || e.ctrlKey) {
            // Cmd/Ctrl+Enter for intelligent processing
            handleIntelligentNavigate(inputValue);
          } else {
            // Regular Enter for basic navigation
            handleBasicNavigate();
          }
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
                minHeight: "60px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <div style={{ fontSize: "18px" }}>🌐</div>
              <div style={{ flex: 1 }}>
                <input
                  ref={inputRef}
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Enter URL or search query... (⌘+Enter for intelligent processing)"
                  style={{
                    width: "100%",
                    border: "none",
                    background: "transparent",
                    fontSize: "14px",
                    outline: "none",
                    color: "#333",
                  }}
                />
                <div
                  style={{ fontSize: "12px", color: "#666", marginTop: "4px" }}
                >
                  Press Enter to navigate • ⌘+Enter for intelligent processing
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
