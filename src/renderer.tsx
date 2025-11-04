/**
 * This file will automatically be loaded by vite and run in the "renderer" context.
 * To learn more about the differences between the "main" and the "renderer" context in
 * Electron, visit:
 *
 * https://electronjs.org/docs/tutorial/application-architecture#main-and-renderer-processes
 *
 * By default, Node.js integration in this file is disabled. When enabling Node.js integration
 * in a renderer process, please be aware of potential security implications. You can read
 * more about security risks here:
 *
 * https://electronjs.org/docs/tutorial/security
 *
 * To enable Node.js integration in this file, open up `main.ts` and enable the `nodeIntegration`
 * flag:
 *
 * ```
 *  // Create the browser window.
 *  mainWindow = new BrowserWindow({
 *    width: 800,
 *    height: 600,
 *    webPreferences: {
 *      nodeIntegration: true
 *    }
 *  });
 * ```
 */
import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";

import { BlockNoteView } from "@blocknote/mantine";
import "@mantine/core/styles.css";
import "@blocknote/mantine/style.css";
import "@blocknote/core/fonts/inter.css";

import { useCreateBlockNote, SuggestionMenuController } from "@blocknote/react";
import { insertOrUpdateBlock } from "@blocknote/core";
import { log } from "./utils/rendererLogger";
import {
  schema,
  CustomBlockNoteEditor,
  CustomPartialBlock,
} from "./types/schema";
import { useDocumentSync } from "./hooks/useDocumentSync";
import { DebugSidebar } from "./components/DebugSidebar";
import { DebugToggle } from "./components/DebugToggle";
import { AppShell, MantineProvider } from "@mantine/core";
import { GoogleSearchExtensionName } from "./Search/GoogleSearchBlock";
import { ChatGPTExtensionName } from "./Search/ChatGPTBlock";
import { URLExtensionName } from "./Search/URLBlock";
import {
  slashCommandOptions,
  filterSlashCommandOptions,
} from "./data/slashCommandOptions";
import {
  SlashCommandLoadingState,
  SlashCommandOption,
} from "./types/slashCommand";

const root = createRoot(document.getElementById("root"));
root.render(<App />);

// Note: Site blocks are no longer user-selectable from slash menu
// They are created programmatically when links are clicked

// Store current editor globally to access in IPC handlers
let currentEditor: CustomBlockNoteEditor | null = null;

const URL_BLOCK_TYPES = new Set([URLExtensionName, "url"]);

// Function to create a new browser block with the specified URL
const createNewBrowserBlock = (url: string): void => {
  if (currentEditor) {
    insertOrUpdateBlock(currentEditor, {
      type: "site",
      props: { url },
    } as unknown as CustomPartialBlock);
  }
};

type SlashCommandMenuProps = {
  items: SlashCommandOption[];
  selectedIndex?: number;
  loadingState: SlashCommandLoadingState;
  onItemClick?: (item: SlashCommandOption) => void;
};

function App() {
  // Debug sidebar state
  const [isDebugSidebarVisible, setIsDebugSidebarVisible] = useState(false);

  // Create editor immediately with no initial content - Y.js sync will populate it
  const editor = useCreateBlockNote({
    schema,
    initialContent: undefined, // Start with no content, Y.js will sync content automatically
  }) as CustomBlockNoteEditor;

  // Store editor reference for IPC handlers
  useEffect(() => {
    currentEditor = editor;
    return () => {
      currentEditor = null;
    };
  }, [editor]);

  // Set up IPC listener for new browser blocks
  useEffect(() => {
    if (!window.electronAPI?.onNewBrowserBlock) {
      return;
    }

    const unsubscribe = window.electronAPI.onNewBrowserBlock((data) => {
      if (data?.url) {
        createNewBrowserBlock(data.url);
      }
    });

    return unsubscribe;
  }, []);

  // Set up IPC listener for block insertion from slash command manager
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

        // Handle the block insertion based on the selected block type
        if (currentEditor) {
          try {
            // Mimic BlockNote's default slash command cleanup so the "/" trigger is removed.
            currentEditor.suggestionMenus.closeMenu();
            currentEditor.suggestionMenus.clearQuery();

            // Use BlockNote's insertOrUpdateBlock like the built-in slash menu items do
            // This handles all focus, cursor positioning, and insertion logic automatically
            switch (blockKey) {
              // Note: 'site' blocks are no longer user-selectable from HUD
              // They are created programmatically when links are clicked
              case "paragraph":
                insertOrUpdateBlock(currentEditor, { type: "paragraph" });
                break;
              case "heading":
                insertOrUpdateBlock(currentEditor, {
                  type: "heading",
                  props: { level: 1 },
                } as unknown as CustomPartialBlock);
                break;
              case "heading_2":
                insertOrUpdateBlock(currentEditor, {
                  type: "heading",
                  props: { level: 2 },
                } as unknown as CustomPartialBlock);
                break;
              case "heading_3":
                insertOrUpdateBlock(currentEditor, {
                  type: "heading",
                  props: { level: 3 },
                } as unknown as CustomPartialBlock);
                break;
              case "bullet_list":
                insertOrUpdateBlock(currentEditor, { type: "bulletListItem" });
                break;
              case "numbered_list":
                insertOrUpdateBlock(currentEditor, {
                  type: "numberedListItem",
                });
                break;
              case "check_list":
                insertOrUpdateBlock(currentEditor, { type: "checkListItem" });
                break;
              case "table":
                insertOrUpdateBlock(currentEditor, { type: "table" });
                break;
              case "image":
                insertOrUpdateBlock(currentEditor, { type: "image" });
                break;
              case "video":
                insertOrUpdateBlock(currentEditor, { type: "video" });
                break;
              case "audio":
                insertOrUpdateBlock(currentEditor, { type: "audio" });
                break;
              case "file":
                insertOrUpdateBlock(currentEditor, { type: "file" });
                break;
              case "google_search":
                insertOrUpdateBlock(currentEditor, {
                  type: GoogleSearchExtensionName,
                });
                break;
              case "chatgpt":
                insertOrUpdateBlock(currentEditor, {
                  type: ChatGPTExtensionName,
                });
                break;
              case "url":
                insertOrUpdateBlock(currentEditor, { type: URLExtensionName });
                break;
              default:
                log.debug(`Unknown block type: ${blockKey}`, "renderer");
            }

            log.debug(`Successfully inserted block: ${blockKey}`, "renderer");
          } catch (error) {
            log.debug(
              `Error inserting block ${blockKey}: ${error}`,
              "renderer"
            );
          }
        }
      }
    );

    return unsubscribe;
  }, []);

  // Set up continuous document state synchronization
  useDocumentSync(editor);

  // Handle debug sidebar toggle
  const handleDebugToggle = (enabled: boolean) => {
    setIsDebugSidebarVisible(enabled);
  };

  const slashCommandActiveRef = React.useRef(false);
  const slashQueryRef = React.useRef("");

  const handleSlashMenuItems = React.useCallback(
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
          "renderer",
        );
        slashCommandActiveRef.current = true;
        window.electronAPI?.startSlashCommand();
      }

      const filtered = filterSlashCommandOptions(query, slashCommandOptions);
      return filtered;
    },
    [editor],
  );

  const SlashCommandSyncMenu = ({
    items,
    selectedIndex,
    loadingState,
  }: SlashCommandMenuProps) => {
    React.useEffect(() => {
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

    React.useEffect(() => {
      return () => {
        slashCommandActiveRef.current = false;
        window.electronAPI?.cancelSlashCommand();
      };
    }, []);

    return null;
  };

  const handleSlashMenuItemClick = React.useCallback(
    (item: SlashCommandOption) => {
      window.electronAPI?.selectSlashCommandBlock(item.key);
    },
    [],
  );

  return (
    <MantineProvider defaultColorScheme="auto">
      <AppShell
        aside={{
          width: 400,
          breakpoint: "sm",
          collapsed: { desktop: !isDebugSidebarVisible },
        }}
        padding="md"
      >
        <AppShell.Main>
          <div className="App">
            <BlockNoteView editor={editor} slashMenu={false}>
              <SuggestionMenuController
                triggerCharacter={"/"}
                suggestionMenuComponent={SlashCommandSyncMenu}
                getItems={handleSlashMenuItems}
                onItemClick={handleSlashMenuItemClick}
              />
            </BlockNoteView>
            <div style={{ height: "2000px", width: "100%", color: "gray" }} />

            {/* Debug toggle button */}
            <DebugToggle onToggle={handleDebugToggle} />
          </div>
        </AppShell.Main>

        <AppShell.Aside p="md">
          <DebugSidebar
            isVisible={isDebugSidebarVisible}
            onToggle={() => setIsDebugSidebarVisible(false)}
          />
        </AppShell.Aside>
      </AppShell>
    </MantineProvider>
  );
}
