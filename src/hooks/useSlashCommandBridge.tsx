import React, { useCallback, useEffect, useRef } from "react";
import { insertOrUpdateBlock } from "@blocknote/core";
import {
  CustomBlockNoteEditor,
  CustomPartialBlock,
} from "../types/schema";
import {
  SlashCommandLoadingState,
  SlashCommandOption,
} from "../types/slashCommand";
import {
  slashCommandOptions,
  filterSlashCommandOptions,
} from "../data/slashCommandOptions";
import { log } from "../utils/rendererLogger";
import { GoogleSearchExtensionName } from "../Search/GoogleSearchBlock";
import { ChatGPTExtensionName } from "../Search/ChatGPTBlock";
import { URLExtensionName } from "../Search/URLBlock";

type SlashCommandMenuProps = {
  items: SlashCommandOption[];
  selectedIndex?: number;
  loadingState: SlashCommandLoadingState;
};

const URL_BLOCK_TYPES = new Set([URLExtensionName, "url"]);

export const useSlashCommandBridge = (editor: CustomBlockNoteEditor) => {
  const slashCommandActiveRef = useRef(false);
  const slashQueryRef = useRef("");

  useEffect(() => {
    if (!window.electronAPI?.onSlashCommandInsert) {
      return;
    }

    const unsubscribe = window.electronAPI.onSlashCommandInsert(
      (blockKey: string) => {
        log.debug(
          `Received block insertion from slash command: ${blockKey}`,
          "renderer"
        );

        if (!editor) {
          return;
        }

        try {
          editor.suggestionMenus.closeMenu();
          editor.suggestionMenus.clearQuery();

          switch (blockKey) {
            case "paragraph":
              insertOrUpdateBlock(editor, { type: "paragraph" });
              break;
            case "heading":
              insertOrUpdateBlock(editor, {
                type: "heading",
                props: { level: 1 },
              } as unknown as CustomPartialBlock);
              break;
            case "heading_2":
              insertOrUpdateBlock(editor, {
                type: "heading",
                props: { level: 2 },
              } as unknown as CustomPartialBlock);
              break;
            case "heading_3":
              insertOrUpdateBlock(editor, {
                type: "heading",
                props: { level: 3 },
              } as unknown as CustomPartialBlock);
              break;
            case "bullet_list":
              insertOrUpdateBlock(editor, { type: "bulletListItem" });
              break;
            case "numbered_list":
              insertOrUpdateBlock(editor, {
                type: "numberedListItem",
              });
              break;
            case "check_list":
              insertOrUpdateBlock(editor, { type: "checkListItem" });
              break;
            case "table":
              insertOrUpdateBlock(editor, { type: "table" });
              break;
            case "image":
              insertOrUpdateBlock(editor, { type: "image" });
              break;
            case "video":
              insertOrUpdateBlock(editor, { type: "video" });
              break;
            case "audio":
              insertOrUpdateBlock(editor, { type: "audio" });
              break;
            case "file":
              insertOrUpdateBlock(editor, { type: "file" });
              break;
            case "google_search":
              insertOrUpdateBlock(editor, {
                type: GoogleSearchExtensionName,
              });
              break;
            case "chatgpt":
              insertOrUpdateBlock(editor, {
                type: ChatGPTExtensionName,
              });
              break;
            case "url":
              insertOrUpdateBlock(editor, { type: URLExtensionName });
              break;
            default:
              log.debug(`Unknown block type: ${blockKey}`, "renderer");
          }

          log.debug(`Successfully inserted block: ${blockKey}`, "renderer");
        } catch (error) {
          log.debug(`Error inserting block ${blockKey}: ${error}`, "renderer");
        }
      }
    );

    return unsubscribe;
  }, [editor]);

  const handleSlashMenuItems = useCallback(
    async (query: string): Promise<SlashCommandOption[]> => {
      const { block } = editor.getTextCursorPosition();
      if (block && URL_BLOCK_TYPES.has(block.type)) {
        log.debug("Slash menu suppressed inside URL block", "renderer");
        editor.suggestionMenus.closeMenu();
        slashCommandActiveRef.current = false;
        window.electronAPI?.cancelSlashCommand();
        return [];
      }

      slashQueryRef.current = query;

      if (!slashCommandActiveRef.current) {
        log.debug(
          "Slash menu triggered, starting custom slash command",
          "renderer"
        );
        slashCommandActiveRef.current = true;
        window.electronAPI?.startSlashCommand();
      }

      const filtered = filterSlashCommandOptions(query, slashCommandOptions);
      return filtered;
    },
    [editor]
  );

  const SlashCommandSyncMenu: React.FC<SlashCommandMenuProps> = ({
    items,
    selectedIndex,
    loadingState,
  }) => {
    useEffect(() => {
      const normalizedIndex =
        typeof selectedIndex === "number"
          ? selectedIndex
          : items.length > 0
          ? 0
          : null;

      window.electronAPI?.updateSlashCommandResults({
        query: slashQueryRef.current,
        items,
        selectedIndex: normalizedIndex,
        loadingState,
      });
    }, [items, selectedIndex, loadingState]);

    useEffect(() => {
      return () => {
        slashCommandActiveRef.current = false;
        window.electronAPI?.cancelSlashCommand();
      };
    }, []);

    return null;
  };

  const handleSlashMenuItemClick = useCallback((item: SlashCommandOption) => {
    window.electronAPI?.selectSlashCommandBlock(item.key);
  }, []);

  return {
    SlashCommandSyncMenu,
    handleSlashMenuItems,
    handleSlashMenuItemClick,
  };
};
