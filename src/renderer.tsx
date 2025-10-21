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

const root = createRoot(document.getElementById("root"));
root.render(<App />);

// Note: Site blocks are no longer user-selectable from slash menu
// They are created programmatically when links are clicked

// Store current editor globally to access in IPC handlers
let currentEditor: CustomBlockNoteEditor | null = null;

// Function to create a new browser block with the specified URL
const createNewBrowserBlock = (url: string): void => {
  if (currentEditor) {
    insertOrUpdateBlock(currentEditor, {
      type: "site",
      props: { url },
    } as unknown as CustomPartialBlock);
  }
};

// Custom suggestion menu component that triggers HUD instead of showing BlockNote's menu
function CustomSlashMenu(): null {
  // Always return null since we don't want to render anything
  // The HUD overlay will be shown instead
  return null;
}

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
                insertOrUpdateBlock(currentEditor, { type: "googleSearch" });
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

  return (
    <MantineProvider>
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
                suggestionMenuComponent={CustomSlashMenu}
                getItems={async () => {
                  // When BlockNote detects "/", trigger our custom HUD instead
                  log.debug(
                    "Slash menu triggered, starting custom slash command",
                    "renderer"
                  );
                  window.electronAPI?.startSlashCommand();
                  return []; // Return empty array since we handle items in HUD
                }}
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
