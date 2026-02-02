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
import { combineAndRank, type SearchResultPayload } from "./combineSuggestions";
import { useAppRoute } from "../../context/AppRouteContext";

const workspacePropSchema = {
  initialQuery: {
    default: "" as const,
  },
} as const;

/**
 * Maps a slash command key to the actual block insertion parameters
 */
function getBlockInsertParams(
  blockKey: string
): { type: string; props?: Record<string, unknown> } | null {
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
      const [searchResults, setSearchResults] = useState<SearchResultPayload[]>(
        []
      );
      const [webSearchResults, setWebSearchResults] = useState<
        Array<{ title: string; url: string; description: string }>
      >([]);
      const [isSearching, setIsSearching] = useState(false);
      const inputRef = useRef<HTMLInputElement>(null);
      const containerRef = useRef<HTMLDivElement>(null);
      const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
        null
      );
      const webSearchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
        null
      );
      const { navigateToUrl, navigateToDoc } = useAppRoute();

      const filteredOptions = filterSlashCommandOptions(
        query,
        slashCommandOptions
      );

      // Debounced in-doc search - only if query is at least 2 chars and not slash trigger
      useEffect(() => {
        if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
        const trimmedQuery = query.trim();
        if (trimmedQuery.length < 2 || trimmedQuery.startsWith("/")) {
          setSearchResults([]);
          setIsSearching(false);
          return;
        }
        setIsSearching(true);
        searchTimeoutRef.current = setTimeout(async () => {
          try {
            const results = await window.electronAPI.search.execute(
              trimmedQuery,
              { minScore: 0.1 },
              5
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
          if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
        };
      }, [query]);

      // Debounced Brave web search (1s) - same conditions as in-doc search
      useEffect(() => {
        if (webSearchTimeoutRef.current)
          clearTimeout(webSearchTimeoutRef.current);
        const trimmedQuery = query.trim();
        if (trimmedQuery.length < 2 || trimmedQuery.startsWith("/")) {
          setWebSearchResults([]);
          return;
        }
        webSearchTimeoutRef.current = setTimeout(async () => {
          try {
            const list = await window.electronAPI.search.webSearch(
              trimmedQuery,
              { count: 5 }
            );
            setWebSearchResults(list);
          } catch {
            setWebSearchResults([]);
          }
        }, 1000);
        return () => {
          if (webSearchTimeoutRef.current)
            clearTimeout(webSearchTimeoutRef.current);
        };
      }, [query]);

      const combinedList = useMemo(
        () =>
          combineAndRank(filteredOptions, searchResults, webSearchResults),
        [filteredOptions, searchResults, webSearchResults]
      );
      const totalItems = combinedList.length;

      useEffect(() => {
        setSelectedIndex(0);
      }, [query, combinedList.length]);

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

      const selectOption = useCallback(
        (option: SlashCommandOption) => {
          const params = getBlockInsertParams(option.key);
          if (!params) {
            dismiss();
            return;
          }

          // Replace this workspace block with the selected block type
          editor.updateBlock(
            block.id,
            params as Parameters<typeof editor.updateBlock>[1]
          );
          editor.focus();
        },
        [editor, block.id, dismiss]
      );

      const handleSelect = useCallback(
        (index: number) => {
          const item = combinedList[index];
          if (!item) return;
          switch (item.kind) {
            case "slash":
              selectOption(item.payload);
              break;
            case "note":
              navigateToDoc(item.payload.documentId, item.payload.blockId);
              dismiss();
              break;
            case "suggest": {
              const { title, url } = item.payload;
              editor.updateBlock(block.id, {
                type: "paragraph",
                content: [
                  {
                    type: "link",
                    href: url,
                    content: [
                      { type: "text", text: title, styles: {} },
                    ],
                  },
                ],
              } as unknown as Parameters<typeof editor.updateBlock>[1]);
              editor.focus();
              navigateToUrl(url);
              break;
            }
          }
        },
        [
          combinedList,
          selectOption,
          navigateToDoc,
          dismiss,
          editor,
          block.id,
          navigateToUrl,
        ]
      );

      const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
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
        },
        [totalItems, selectedIndex, handleSelect, dismiss]
      );

      // Scroll selected item into view
      useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const selectedEl = container.querySelector(
          `[data-index="${selectedIndex}"]`
        );
        if (selectedEl) {
          selectedEl.scrollIntoView({ block: "nearest" });
        }
      }, [selectedIndex]);

      return (
        <div
          style={{
            width: "100%",
            maxWidth: "100%",
            border: "1px solid var(--mantine-color-default-border)",
            borderRadius: "8px",
            backgroundColor: "var(--mantine-color-default)",
            boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
            overflow: "hidden",
            margin: "4px 0",
          }}
        >
          {/* Search input */}
          <div
            style={{
              padding: "8px",
              borderBottom: "1px solid var(--mantine-color-default-border)",
            }}
          >
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
                border: "1px solid var(--mantine-color-default-border)",
                borderRadius: "6px",
                fontSize: "14px",
                outline: "none",
                backgroundColor: "var(--mantine-color-body)",
                color: "var(--mantine-color-text)",
              }}
              onFocus={(e) => {
                e.target.style.borderColor =
                  "var(--mantine-color-blue-6)";
              }}
              onBlur={(e) => {
                e.target.style.borderColor =
                  "var(--mantine-color-default-border)";
              }}
            />
          </div>

          {/* Single flat list of ranked results */}
          <div
            ref={containerRef}
            style={{
              minWidth: "320px",
              width: "100%",
              maxWidth: "100%",
              maxHeight: "800px",
              overflowY: "auto",
              padding: "8px 0",
            }}
          >
            {combinedList.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              const rowStyle = {
                padding: "8px 12px",
                cursor: "pointer" as const,
                backgroundColor: isSelected
                  ? "var(--mantine-color-default-hover)"
                  : "transparent",
                borderLeft: isSelected
                  ? "2px solid var(--mantine-color-blue-6)"
                  : "2px solid transparent",
              };
              if (item.kind === "slash") {
                return (
                  <div
                    key={`slash-${item.payload.key}`}
                    data-index={idx}
                    onClick={() => handleSelect(idx)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    style={rowStyle}
                  >
                    <div
                      style={{
                        fontSize: "14px",
                        fontWeight: 500,
                        color: "var(--mantine-color-text)",
                      }}
                    >
                      {item.payload.title}
                    </div>
                    {item.payload.subtext && (
                      <div
                        style={{
                          fontSize: "12px",
                          color: "var(--mantine-color-dimmed)",
                          marginTop: "2px",
                        }}
                      >
                        {item.payload.subtext}
                      </div>
                    )}
                  </div>
                );
              }
              if (item.kind === "note") {
                const r = item.payload;
                return (
                  <div
                    key={`note-${r.blockId}`}
                    data-index={idx}
                    onClick={() => handleSelect(idx)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    style={rowStyle}
                  >
                    <div
                      style={{
                        fontSize: "14px",
                        color: "var(--mantine-color-text)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {r.content.slice(0, 50)}
                      {r.content.length > 50 ? "..." : ""}
                    </div>
                    <div
                      style={{
                        fontSize: "11px",
                        color: "var(--mantine-color-dimmed)",
                        marginTop: "2px",
                      }}
                    >
                      {r.blockType} · {Math.round(r.score * 100)}%
                    </div>
                  </div>
                );
              }
              return (
                <div
                  key={`suggest-${item.payload.url}`}
                  data-index={idx}
                  onClick={() => handleSelect(idx)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  style={rowStyle}
                >
                  <div
                    style={{
                      fontSize: "14px",
                      color: "var(--mantine-color-text)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {item.payload.title}
                  </div>
                  {item.payload.description && (
                    <div
                      style={{
                        fontSize: "12px",
                        color: "var(--mantine-color-dimmed)",
                        marginTop: "2px",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {item.payload.description.slice(0, 60)}
                      {item.payload.description.length > 60 ? "..." : ""}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {isSearching &&
            searchResults.length === 0 &&
            combinedList.length === 0 && (
              <div
                style={{
                  padding: "8px 12px",
                  fontSize: "12px",
                  color: "var(--mantine-color-dimmed)",
                  fontStyle: "italic",
                }}
              >
                Searching...
              </div>
            )}

          {!isSearching && combinedList.length === 0 && (
            <div
              style={{
                padding: "12px 16px",
                color: "var(--mantine-color-dimmed)",
                fontSize: "13px",
              }}
            >
              No matching blocks, notes, or suggestions
            </div>
          )}

          {/* Footer hint */}
          <div
            style={{
              padding: "8px 12px",
              borderTop: "1px solid var(--mantine-color-default-border)",
              fontSize: "11px",
              color: "var(--mantine-color-dimmed)",
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
