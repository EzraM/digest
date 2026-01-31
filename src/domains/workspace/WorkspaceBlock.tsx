import { createReactBlockSpec } from "@blocknote/react";
import { useState, useEffect, useRef, useCallback } from "react";
import {
  slashCommandOptions,
  filterSlashCommandOptions,
} from "../../data/slashCommandOptions";
import { SlashCommandOption } from "../../types/slashCommand";
import { insertOrUpdateBlock } from "@blocknote/core";
import { GoogleSearchExtensionName } from "../../Search/GoogleSearchBlock";
import { ChatGPTExtensionName } from "../../Search/ChatGPTBlock";
import { URLExtensionName } from "../../Search/URLBlock";

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
      const inputRef = useRef<HTMLInputElement>(null);
      const containerRef = useRef<HTMLDivElement>(null);

      const filteredOptions = filterSlashCommandOptions(query, slashCommandOptions);

      // Reset selection when filtered options change
      useEffect(() => {
        setSelectedIndex(0);
      }, [query]);

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

      const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        switch (e.key) {
          case "ArrowDown":
            e.preventDefault();
            setSelectedIndex((prev) =>
              prev < filteredOptions.length - 1 ? prev + 1 : prev
            );
            break;
          case "ArrowUp":
            e.preventDefault();
            setSelectedIndex((prev) => (prev > 0 ? prev - 1 : prev));
            break;
          case "Enter":
            e.preventDefault();
            if (filteredOptions[selectedIndex]) {
              selectOption(filteredOptions[selectedIndex]);
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
                prev < filteredOptions.length - 1 ? prev + 1 : prev
              );
            }
            break;
        }
      }, [filteredOptions, selectedIndex, selectOption, dismiss]);

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
              placeholder="Type to filter..."
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

          {/* Options list */}
          <div
            ref={containerRef}
            style={{
              maxHeight: "300px",
              overflowY: "auto",
              padding: "4px 0",
            }}
          >
            {filteredOptions.length === 0 ? (
              <div
                style={{
                  padding: "12px 16px",
                  color: "#868e96",
                  fontSize: "13px",
                }}
              >
                No matching blocks
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
                    const currentIndex = flatIndex++;
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
