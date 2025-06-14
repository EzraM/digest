import React, { useState, useRef, useEffect } from "react";
import { createReactBlockSpec } from "@blocknote/react";
import { Page } from "./Page";
import { SearchResults } from "./SearchResults";
import { ContentPreview } from "./ContentPreview";
import { ProcessingState } from "./ProcessingState";
import {
  IntelligentUrlHandler,
  SiteBlockStatus,
  ProcessingResult,
  DocumentContext,
} from "../../services/IntelligentUrlHandler";

// Use the enhanced status type from the service
type SiteStatus = SiteBlockStatus;

export const site = createReactBlockSpec(
  {
    type: "site",
    propSchema: {
      url: { default: "" },
      status: {
        default: "entry",
        values: [
          "entry",
          "processing",
          "page",
          "preview",
          "search_results",
          "error",
        ],
      },
      processingResult: { default: "" }, // JSON string of ProcessingResult
      searchQuery: { default: "" },
    },
    content: "none", // No inline content - we'll handle our own input
  },
  {
    render: (props) => {
      const { block, editor } = props;
      const { url, status, processingResult, searchQuery } = block.props;
      const [inputValue, setInputValue] = useState(url || "");
      const [intelligentHandler] = useState(() => new IntelligentUrlHandler());
      const inputRef = useRef<HTMLInputElement>(null);

      // Parse processing result if available
      let parsedResult: ProcessingResult | null = null;
      try {
        if (processingResult) {
          parsedResult = JSON.parse(processingResult);
        }
      } catch (error) {
        console.error("Failed to parse processing result:", error);
      }

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

      // Enhanced intelligent navigation handler
      const handleIntelligentNavigate = async (input: string) => {
        try {
          console.log(
            "[SiteBlock] Starting intelligent navigation for:",
            input
          );

          // Set processing state
          editor.updateBlock(block, {
            type: "site",
            props: {
              ...block.props,
              status: "processing" as SiteBlockStatus,
              searchQuery: input,
            },
          });

          // Extract document context (you could enhance this to get real context from the editor)
          const context: DocumentContext =
            IntelligentUrlHandler.extractDocumentContext();

          // Process the input using IPC
          const result: ProcessingResult =
            await intelligentHandler.processInput(input, context);

          console.log("[SiteBlock] Intelligent processing result:", result);

          // Handle the result based on the action
          switch (result.action) {
            case "navigate":
              if (result.data?.url) {
                console.log("[SiteBlock] Navigating to:", result.data.url);
                editor.updateBlock(block, {
                  type: "site",
                  props: {
                    ...block.props,
                    url: result.data.url,
                    status: "page" as SiteBlockStatus,
                    searchQuery: undefined,
                  },
                });
              } else {
                throw new Error("No URL provided for navigation");
              }
              break;

            case "search":
              console.log("[SiteBlock] Showing search results");
              editor.updateBlock(block, {
                type: "site",
                props: {
                  ...block.props,
                  status: "search_results" as SiteBlockStatus,
                  processingResult: JSON.stringify(result),
                  searchQuery: input,
                },
              });
              break;

            case "clarify":
              console.log("[SiteBlock] Showing clarification options");
              editor.updateBlock(block, {
                type: "site",
                props: {
                  ...block.props,
                  status: "search_results" as SiteBlockStatus,
                  processingResult: JSON.stringify(result),
                  searchQuery: input,
                },
              });
              break;

            case "error":
            default:
              console.log(
                "[SiteBlock] Error or unknown action:",
                result.action
              );
              editor.updateBlock(block, {
                type: "site",
                props: {
                  ...block.props,
                  status: "error" as SiteBlockStatus,
                  processingResult: JSON.stringify(result),
                  searchQuery: input,
                },
              });
              break;
          }
        } catch (error) {
          console.error("[SiteBlock] Error in intelligent navigation:", error);

          // Fallback to basic navigation
          const fallbackUrl = IntelligentUrlHandler.isValidUrl(input)
            ? IntelligentUrlHandler.formatUrl(input)
            : `https://www.google.com/search?q=${encodeURIComponent(input)}`;

          editor.updateBlock(block, {
            type: "site",
            props: {
              ...block.props,
              url: fallbackUrl,
              status: "page" as SiteBlockStatus,
              searchQuery: undefined,
            },
          });
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
              status: "page",
              processingResult: "",
              searchQuery: "",
            },
          });
        }
      };

      const handleCancel = () => {
        editor.updateBlock(block, {
          type: "site",
          props: {
            ...block.props,
            status: "entry",
            processingResult: "",
            searchQuery: "",
          },
        });
      };

      const handleSearchResultSelect = (selectedUrl: string) => {
        editor.updateBlock(block, {
          type: "site",
          props: {
            url: selectedUrl,
            status: "page",
            processingResult: "",
            searchQuery: "",
          },
        });
      };

      const handlePreviewExpand = () => {
        if (parsedResult?.data?.url) {
          editor.updateBlock(block, {
            type: "site",
            props: {
              url: parsedResult.data.url,
              status: "page",
              processingResult: "",
              searchQuery: "",
            },
          });
        }
      };

      const handleEditUrl = () => {
        setInputValue(url || "");
        editor.updateBlock(block, {
          type: "site",
          props: {
            ...block.props,
            status: "entry",
            processingResult: "",
            searchQuery: "",
          },
        });
      };

      // Handle processing state
      if (effectiveStatus === "processing") {
        return (
          <ProcessingState
            input={searchQuery || inputValue}
            stage="analyzing"
            onCancel={handleCancel}
          />
        );
      }

      // Handle search results state
      if (
        effectiveStatus === "search_results" &&
        parsedResult?.data?.searchResults
      ) {
        return (
          <SearchResults
            results={parsedResult.data.searchResults}
            query={searchQuery || inputValue}
            onSelect={handleSearchResultSelect}
            onCancel={handleCancel}
          />
        );
      }

      // Handle preview state
      if (effectiveStatus === "preview" && parsedResult?.data?.preview) {
        return (
          <ContentPreview
            preview={parsedResult.data.preview}
            onExpand={handlePreviewExpand}
            onEdit={handleEditUrl}
          />
        );
      }

      // Handle error state
      if (effectiveStatus === "error") {
        const errorMessage = parsedResult?.data?.error || "An error occurred";
        return (
          <div
            style={{
              border: "1px solid #fca5a5",
              borderRadius: "6px",
              backgroundColor: "#fef2f2",
              padding: "16px",
              maxWidth: "100%",
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
              <span style={{ fontSize: "20px" }}>❌</span>
              <span style={{ fontWeight: "600", color: "#dc2626" }}>Error</span>
            </div>
            <p style={{ margin: "0 0 12px 0", color: "#666" }}>
              {errorMessage}
            </p>
            <button
              onClick={handleEditUrl}
              style={{
                padding: "6px 12px",
                border: "1px solid #dc2626",
                borderRadius: "4px",
                backgroundColor: "#dc2626",
                color: "white",
                cursor: "pointer",
                fontSize: "12px",
              }}
            >
              Try Again
            </button>
          </div>
        );
      }

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
                handleIntelligentNavigate(inputValue);
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
            onClick={(e) => {
              e.preventDefault();
              handleIntelligentNavigate(inputValue);
            }}
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
