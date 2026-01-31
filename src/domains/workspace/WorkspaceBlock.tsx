import { createReactBlockSpec } from "@blocknote/react";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  slashCommandOptions,
  filterSlashCommandOptions,
} from "../../data/slashCommandOptions";
import { SlashCommandOption } from "../../types/slashCommand";
import { GoogleSearchExtensionName } from "../../Search/GoogleSearchBlock";
import { ChatGPTExtensionName } from "../../Search/ChatGPTBlock";
import { URLExtensionName } from "../../Search/URLBlock";

/** Search result from the vector store */
interface SearchResult {
  blockId: string;
  documentId: string;
  blockType: string;
  content: string;
  score: number;
  metadata: Record<string, unknown>;
}

const workspacePropSchema = {
  initialQuery: {
    default: "" as const,
  },
} as const;

/**
 * Maps a slash command key to the actual block insertion parameters
 */
function getBlockInsertParams(blockKey: string): { type: string; props?: Record<string, unknown> } | null {
  switch (blockKey) {
    case "paragraph":
      return { type: "paragraph" };
    case "heading":
      return { type: "heading", props: { level: 1 } };
    case "heading_2":
      return { type: "heading", props: { level: 2 } };
    case "heading_3":
      return { type: "heading", props: { level: 3 } };
    case "bullet_list":
      return { type: "bulletListItem" };
    case "numbered_list":
      return { type: "numberedListItem" };
    case "check_list":
      return { type: "checkListItem" };
    case "table":
      return { type: "table" };
    case "image":
      return { type: "image" };
    case "video":
      return { type: "video" };
    case "audio":
      return { type: "audio" };
    case "file":
      return { type: "file" };
    case "google_search":
      return { type: GoogleSearchExtensionName };
    case "chatgpt":
      return { type: ChatGPTExtensionName };
    case "url":
      return { type: URLExtensionName };
    default:
      return null;
  }
}

export const workspace = createReactBlockSpec(
  {
    type: "workspace" as const,
    propSchema: workspacePropSchema,
    content: "none",
  },
  {
    render: (props) => {
      const { block, editor } = props;
      const [query, setQuery] = useState(block.props.initialQuery || "");
      const [selectedIndex, setSelectedIndex] = useState(0);
      const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
      const [isSearching, setIsSearching] = useState(false);
      const inputRef = useRef<HTMLInputElement>(null);
      const containerRef = useRef<HTMLDivElement>(null);
      const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

      const filteredOptions = filterSlashCommandOptions(query, slashCommandOptions);

      // Debounced search - only search if query is at least 2 characters and not a slash command trigger
      useEffect(() => {
        // Clear any pending search
        if (searchTimeoutRef.current) {
          clearTimeout(searchTimeoutRef.current);
        }

        // Don't search for very short queries or if query starts with special characters
        const trimmedQuery = query.trim();
        if (trimmedQuery.length < 2 || trimmedQuery.startsWith("/")) {
          setSearchResults([]);
          setIsSearching(false);
          return;
        }

        setIsSearching(true);

        // Debounce search by 300ms
        searchTimeoutRef.current = setTimeout(async () => {
          try {
            const results = await window.electronAPI.search.execute(
              trimmedQuery,
              { minScore: 0.1 },
              5  // Limit to 5 results
            );
            setSearchResults(results);
          } catch (error) {
            console.error("Search failed:", error);
            setSearchResults([]);
          } finally {
            setIsSearching(false);
          }
        }, 300);

        return () => {
          if (searchTimeoutRef.current) {
            clearTimeout(searchTimeoutRef.current);
          }
        };
      }, [query]);

      // Compute total items: slash commands + search results
      const totalItems = useMemo(() => {
        return filteredOptions.length + searchResults.length;
      }, [filteredOptions.length, searchResults.length]);

      // Reset selection when options/results change
      useEffect(() => {
        setSelectedIndex(0);
      }, [query, searchResults.length]);

      // Focus input on mount
      useEffect(() => {
        // Small delay to ensure the block is rendered
        const timer = setTimeout(() => {
          inputRef.current?.focus();
        }, 0);
        return () => clearTimeout(timer);
      }, []);

      const dismiss = useCallback(() => {
        // Remove this workspace block
        editor.removeBlocks([block.id]);
        // Focus back on editor
        editor.focus();
      }, [editor, block.id]);

      const selectOption = useCallback((option: SlashCommandOption) => {
        const params = getBlockInsertParams(option.key);
        if (!params) {
          dismiss();
          return;
        }

        // Replace this workspace block with the selected block type
        editor.updateBlock(block.id, params as Parameters<typeof editor.updateBlock>[1]);
        editor.focus();
      }, [editor, block.id, dismiss]);

      const selectSearchResult = useCallback((result: SearchResult) => {
        // For now, insert the search result content as a paragraph
        // In the future, this could navigate to the block or do something more sophisticated
        editor.updateBlock(block.id, {
          type: "paragraph",
          content: result.content,
        });
        editor.focus();
      }, [editor, block.id]);

      // Unified selection handler that picks between slash commands and search results
      const handleSelect = useCallback((index: number) => {
        if (index < filteredOptions.length) {
          // It's a slash command option
          selectOption(filteredOptions[index]);
        } else {
          // It's a search result
          const searchIndex = index - filteredOptions.length;
          if (searchResults[searchIndex]) {
            selectSearchResult(searchResults[searchIndex]);
          }
        }
      }, [filteredOptions, searchResults, selectOption, selectSearchResult]);

      const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        switch (e.key) {
          case "ArrowDown":
            e.preventDefault();
            setSelectedIndex((prev) =>
              prev < totalItems - 1 ? prev + 1 : prev
            );
            break;
          case "ArrowUp":
            e.preventDefault();
            setSelectedIndex((prev) => (prev > 0 ? prev - 1 : prev));
            break;
          case "Enter":
            e.preventDefault();
            if (totalItems > 0) {
              handleSelect(selectedIndex);
            }
            break;
          case "Escape":
            e.preventDefault();
            dismiss();
            break;
          case "Tab":
            e.preventDefault();
            if (e.shiftKey) {
              setSelectedIndex((prev) => (prev > 0 ? prev - 1 : prev));
            } else {
              setSelectedIndex((prev) =>
                prev < totalItems - 1 ? prev + 1 : prev
              );
            }
            break;
        }
      }, [totalItems, selectedIndex, handleSelect, dismiss]);

      // Scroll selected item into view
      useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const selectedEl = container.querySelector(`[data-index="${selectedIndex}"]`);
        if (selectedEl) {
          selectedEl.scrollIntoView({ block: "nearest" });
        }
      }, [selectedIndex]);

      // Group options by their group property
      const groupedOptions = filteredOptions.reduce((acc, option) => {
        const group = option.group || "Other";
        if (!acc[group]) {
          acc[group] = [];
        }
        acc[group].push(option);
        return acc;
      }, {} as Record<string, SlashCommandOption[]>);

      // Flatten for index tracking
      let flatIndex = 0;

      return (
        <div
          style={{
            border: "1px solid #e0e0e0",
            borderRadius: "8px",
            backgroundColor: "#fff",
            boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
            overflow: "hidden",
            margin: "4px 0",
          }}
        >
          {/* Search input */}
          <div style={{ padding: "8px", borderBottom: "1px solid #f0f0f0" }}>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search notes or type to insert..."
              style={{
                width: "100%",
                padding: "8px 12px",
                border: "1px solid #e0e0e0",
                borderRadius: "6px",
                fontSize: "14px",
                outline: "none",
              }}
              onFocus={(e) => e.target.style.borderColor = "#228be6"}
              onBlur={(e) => e.target.style.borderColor = "#e0e0e0"}
            />
          </div>

          {/* Options and results list */}
          <div
            ref={containerRef}
            style={{
              maxHeight: "300px",
              overflowY: "auto",
              padding: "4px 0",
            }}
          >
            {/* Search results section */}
            {searchResults.length > 0 && (
              <div>
                <div
                  style={{
                    padding: "6px 12px",
                    fontSize: "11px",
                    fontWeight: 600,
                    color: "#228be6",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <span style={{ fontSize: "12px" }}>🔍</span>
                  Notes
                </div>
                {searchResults.map((result, idx) => {
                  const currentIndex = idx;
                  const isSelected = currentIndex === selectedIndex;
                  return (
                    <div
                      key={result.blockId}
                      data-index={currentIndex}
                      onClick={() => selectSearchResult(result)}
                      onMouseEnter={() => setSelectedIndex(currentIndex)}
                      style={{
                        padding: "8px 12px",
                        cursor: "pointer",
                        backgroundColor: isSelected ? "#e7f5ff" : "transparent",
                        borderLeft: isSelected ? "2px solid #228be6" : "2px solid transparent",
                      }}
                    >
                      <div
                        style={{
                          fontSize: "14px",
                          fontWeight: 500,
                          color: "#212529",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {result.content.slice(0, 60)}{result.content.length > 60 ? "..." : ""}
                      </div>
                      <div
                        style={{
                          fontSize: "11px",
                          color: "#868e96",
                          marginTop: "2px",
                          display: "flex",
                          gap: "8px",
                        }}
                      >
                        <span style={{ textTransform: "capitalize" }}>{result.blockType}</span>
                        <span>·</span>
                        <span>{Math.round(result.score * 100)}% match</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Loading indicator */}
            {isSearching && searchResults.length === 0 && (
              <div
                style={{
                  padding: "8px 12px",
                  fontSize: "12px",
                  color: "#868e96",
                  fontStyle: "italic",
                }}
              >
                Searching...
              </div>
            )}

            {/* Divider between search results and slash commands */}
            {searchResults.length > 0 && filteredOptions.length > 0 && (
              <div style={{ borderTop: "1px solid #f0f0f0", margin: "4px 0" }} />
            )}

            {/* Slash command options */}
            {filteredOptions.length === 0 && searchResults.length === 0 && !isSearching ? (
              <div
                style={{
                  padding: "12px 16px",
                  color: "#868e96",
                  fontSize: "13px",
                }}
              >
                No matching blocks or notes
              </div>
            ) : (
              Object.entries(groupedOptions).map(([groupName, options]) => (
                <div key={groupName}>
                  <div
                    style={{
                      padding: "6px 12px",
                      fontSize: "11px",
                      fontWeight: 600,
                      color: "#868e96",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                    }}
                  >
                    {groupName}
                  </div>
                  {options.map((option) => {
                    // Offset by search results length
                    const currentIndex = searchResults.length + flatIndex++;
                    const isSelected = currentIndex === selectedIndex;
                    return (
                      <div
                        key={option.key}
                        data-index={currentIndex}
                        onClick={() => selectOption(option)}
                        onMouseEnter={() => setSelectedIndex(currentIndex)}
                        style={{
                          padding: "8px 12px",
                          cursor: "pointer",
                          backgroundColor: isSelected ? "#f1f3f5" : "transparent",
                          display: "flex",
                          alignItems: "center",
                          gap: "12px",
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          <div
                            style={{
                              fontSize: "14px",
                              fontWeight: 500,
                              color: "#212529",
                            }}
                          >
                            {option.title}
                          </div>
                          {option.subtext && (
                            <div
                              style={{
                                fontSize: "12px",
                                color: "#868e96",
                                marginTop: "2px",
                              }}
                            >
                              {option.subtext}
                            </div>
                          )}
                        </div>
                        {option.badge && (
                          <div
                            style={{
                              fontSize: "11px",
                              color: "#868e96",
                              fontFamily: "monospace",
                            }}
                          >
                            {option.badge}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </div>

          {/* Footer hint */}
          <div
            style={{
              padding: "8px 12px",
              borderTop: "1px solid #f0f0f0",
              fontSize: "11px",
              color: "#868e96",
              display: "flex",
              gap: "12px",
            }}
          >
            <span>↑↓ navigate</span>
            <span>↵ select</span>
            <span>esc dismiss</span>
          </div>
        </div>
      );
    },
  }
);

export type WorkspaceBlockSpec = typeof workspace;
