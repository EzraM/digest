import React, { useCallback, useEffect, useRef } from "react";
import { insertOrUpdateBlock } from "@blocknote/core";
import {
  CustomBlockNoteEditor,
  CustomPartialBlock,
} from "../types/schema";
import { SlashCommandOption } from "../types/slashCommand";
import { log } from "../utils/rendererLogger";
import { URLExtensionName } from "../Search/URLBlock";

const URL_BLOCK_TYPES = new Set([URLExtensionName, "url"]);

export const useSlashCommandBridge = (editor: CustomBlockNoteEditor) => {
  const workspaceInsertPendingRef = useRef(false);

  const handleSlashMenuItems = useCallback(
    async (query: string): Promise<SlashCommandOption[]> => {
      const { block } = editor.getTextCursorPosition();

      // Don't trigger workspace inside URL blocks
      if (block && URL_BLOCK_TYPES.has(block.type)) {
        log.debug("Slash menu suppressed inside URL block", "renderer");
        editor.suggestionMenus.closeMenu();
        return [];
      }

      // Insert workspace block on first trigger (when query is empty)
      if (!workspaceInsertPendingRef.current && query === "") {
        workspaceInsertPendingRef.current = true;

        queueMicrotask(() => {
          try {
            const { block: currentBlock } = editor.getTextCursorPosition();

            if (currentBlock?.type === "workspace") {
              return;
            }

            log.debug("Inserting workspace block", "renderer");

            // BlockNote's suggestion-menu selection flow clears the query
            // before executing an item. This removes the "/" trigger so
            // insertOrUpdateBlock can replace the now-empty paragraph.
            editor.suggestionMenus.clearQuery();

            // Close the suggestion menu - workspace block handles the UI.
            editor.suggestionMenus.closeMenu();

            // Insert the workspace block at cursor
            insertOrUpdateBlock(editor, {
              type: "workspace",
              props: { initialQuery: "" },
            } as unknown as CustomPartialBlock);
          } finally {
            workspaceInsertPendingRef.current = false;
          }
        });

        return [];
      }

      // Return empty - workspace block handles everything
      return [];
    },
    [editor]
  );

  // Minimal menu component - returns null since workspace block handles UI
  const SlashCommandSyncMenu: React.FC = () => {
    useEffect(() => {
      return () => {
        workspaceInsertPendingRef.current = false;
      };
    }, []);

    return null;
  };

  const handleSlashMenuItemClick = useCallback(() => {
    // No-op - workspace block handles selection
  }, []);

  return {
    SlashCommandSyncMenu,
    handleSlashMenuItems,
    handleSlashMenuItemClick,
  };
};
