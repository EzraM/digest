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
import React, { useEffect, useState, useRef, useCallback } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";

import "@blocknote/core/fonts/inter.css";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";
import {
  useCreateBlockNote,
  SuggestionMenuController,
  getDefaultReactSlashMenuItems,
  SuggestionMenuProps,
  DefaultReactSuggestionItem,
} from "@blocknote/react";
import {
  BlockNoteSchema,
  defaultBlockSpecs,
  insertOrUpdateBlock,
} from "@blocknote/core";
import { site } from "./Browser/Browser";
import { RiPagesFill } from "react-icons/ri";
import { log } from "./utils/rendererLogger";

const root = createRoot(document.getElementById("root"));
root.render(<App />);

const schema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    site: site,
  },
});

// slash menu item to insert a Site
const addSite = (editor: any) => ({
  title: "Site",
  key: "site",
  onItemClick: () => {
    insertOrUpdateBlock(editor, {
      type: "site",
    });
  },
  aliases: ["site", "url", "/"],
  group: "Browser",
  icon: <RiPagesFill />,
});

// Store a reference to the current editor for use in IPC handlers
let currentEditor: any | null = null;
// Store the cursor position when slash command is triggered
let savedCursorPosition: any = null;

// Handler for creating a new browser block
const createNewBrowserBlock = (url: string): void => {
  if (!currentEditor) {
    console.error("Cannot create browser block - editor not available");
    return;
  }

  try {
    // Use insertOrUpdateBlock like the working addSite function
    const newBlock = insertOrUpdateBlock(currentEditor, {
      type: "site",
      props: { url: url },
    } as any);

    if (newBlock && newBlock.id) {
      const blockId = newBlock.id;

      // Update the browser URL via IPC
      if (window.electronAPI?.updateBrowserUrl) {
        window.electronAPI.updateBrowserUrl({ blockId, url });
      }
    }
  } catch (error) {
    console.error("Error creating browser block:", error);
  }
};

function SuggestionStub(props: SuggestionMenuProps<any>): JSX.Element | null {
  const { onItemClick, items } = props;

  // Send open event when suggestion menu appears
  useEffect(() => {
    if (items && items.length > 0) {
      // Capture the current cursor position before opening HUD
      if (currentEditor) {
        try {
          savedCursorPosition = currentEditor.getTextCursorPosition();
          log.debug("Captured cursor position for HUD insertion", "renderer");
        } catch (error) {
          log.debug(`Error capturing cursor position: ${error}`, "renderer");
        }
      }
      log.debug("Slash menu opened, triggering HUD", "renderer");
      window.electronAPI?.addBlockEvent({ type: "open" });
    } else {
      log.debug("Slash menu closed, hiding HUD", "renderer");
      window.electronAPI?.addBlockEvent({ type: "close" });
    }
  }, [items]);

  // Handle cleanup when component unmounts (menu closes)
  useEffect(() => {
    return () => {
      log.debug("Suggestion menu unmounting, hiding HUD", "renderer");
      window.electronAPI?.addBlockEvent({ type: "close" });
    };
  }, []);

  // Don't render anything - the HUD will handle the UI
  return null;
}

function App() {
  const editor = useCreateBlockNote({
    schema,
    initialContent: [
      {
        type: "paragraph",
        content: "Welcome to Digest!",
      },
    ],
  });

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

  // Set up IPC listener for block selection from HUD
  useEffect(() => {
    if (!window.electronAPI?.onSelectBlockType) {
      return;
    }

    const unsubscribe = window.electronAPI.onSelectBlockType(
      (blockKey: string) => {
        log.debug(`Received block selection from HUD: ${blockKey}`, "renderer");

        // Handle the block insertion based on the selected block type
        if (currentEditor) {
          try {
            // First, ensure the editor has focus
            currentEditor.focus();

            // Wait a brief moment for focus to be established, then insert
            setTimeout(() => {
              try {
                // Map HUD block keys to BlockNote block types
                const blockTypeMapping: Record<string, any> = {
                  // Custom blocks
                  site: { type: "site" },

                  // Basic blocks
                  paragraph: { type: "paragraph" },
                  heading: { type: "heading", props: { level: 1 } },
                  heading_2: { type: "heading", props: { level: 2 } },
                  heading_3: { type: "heading", props: { level: 3 } },

                  // Lists
                  bullet_list: { type: "bulletListItem" },
                  numbered_list: { type: "numberedListItem" },
                  check_list: { type: "checkListItem" },

                  // Advanced blocks
                  table: { type: "table" },

                  // Media blocks
                  image: { type: "image" },
                  video: { type: "video" },
                  audio: { type: "audio" },
                  file: { type: "file" },
                };

                const blockConfig = blockTypeMapping[blockKey];
                if (blockConfig) {
                  // Insert at the end of the document to avoid cursor position issues
                  const newBlocks = currentEditor.insertBlocks(
                    [blockConfig],
                    currentEditor.document[currentEditor.document.length - 1],
                    "after"
                  );
                  log.debug(
                    `Successfully inserted block: ${blockKey}`,
                    "renderer"
                  );

                  // Don't try to set cursor position - let BlockNote handle it naturally
                  // The setTextCursorPosition call was causing the "TextSelection endpoint" error
                } else {
                  log.debug(`Unknown block type: ${blockKey}`, "renderer");
                }

                // Clear the saved position after using it
                savedCursorPosition = null;
              } catch (error) {
                log.debug(
                  `Error inserting block ${blockKey}: ${error}`,
                  "renderer"
                );
              }
            }, 50); // Brief delay to ensure focus is established
          } catch (error) {
            log.debug(
              `Error preparing for block insertion ${blockKey}: ${error}`,
              "renderer"
            );
          }
        }
      }
    );

    return unsubscribe;
  }, []);

  // Function to filter suggestion items based on query
  const filterSuggestionItems = async (
    items: any[],
    query: string
  ): Promise<any[]> => {
    if (!query) return items;
    return items.filter((item) =>
      item.title.toLowerCase().includes(query.toLowerCase())
    );
  };

  return (
    <div className="App">
      <BlockNoteView editor={editor} slashMenu={false}>
        <SuggestionMenuController
          triggerCharacter="/"
          suggestionMenuComponent={SuggestionStub}
          getItems={async (query) =>
            filterSuggestionItems(
              [...getDefaultReactSlashMenuItems(editor), addSite(editor)],
              query
            )
          }
        />
      </BlockNoteView>
      <div style={{ height: "2000px", width: "100%", color: "gray" }} />
    </div>
  );
}

declare global {
  interface Window {
    electronAPI: {
      setUrl: (url: string) => void;
      updateBrowser: (browserLayout: any) => void;
      updateBrowserUrl: (data: { blockId: string; url: string }) => void;
      removeBrowser: (blockId: string) => void;
      addBlockEvent: (event: any) => void;
      onBrowserUpdate: (callback: (data: any) => void) => void;
      onBrowserRemove: (callback: (blockId: string) => void) => void;
      onNewBrowserBlock: (callback: (data: { url: string }) => void) => void;
      debugLinkClick: (url: string) => void;
      testNewBrowserBlock: (url: string) => void;
      testCommunication: (callback?: (result: string) => void) => string | void;
    };
  }
}
