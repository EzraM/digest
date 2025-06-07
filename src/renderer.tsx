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

// Custom key handler for slash commands - bypasses BlockNote's suggestion system
const useSlashCommandHandler = (editor: any) => {
  useEffect(() => {
    if (!editor) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      // Only handle "/" when starting a new block (empty paragraph at cursor position 0)
      if (event.key === "/" && event.target) {
        // Don't trigger slash command if the event comes from an input field, textarea, or other form elements
        const target = event.target as HTMLElement;
        if (
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable === false
        ) {
          log.debug(
            `Slash key pressed in form element (${target.tagName}), ignoring`,
            "renderer"
          );
          return;
        }

        try {
          const selection = editor.getTextCursorPosition();
          const currentBlock = selection?.block;

          // Debug: log the full selection object to understand its structure
          log.debug(
            `Selection object: ${JSON.stringify(selection, null, 2)}`,
            "renderer"
          );
          log.debug(
            `Current block: ${JSON.stringify(currentBlock, null, 2)}`,
            "renderer"
          );

          // Only trigger slash command if:
          // 1. We're in a paragraph block
          // 2. The block is completely empty (no content)
          const isEmptyParagraph =
            currentBlock?.type === "paragraph" &&
            (!currentBlock.content || currentBlock.content.length === 0);

          // Try different ways to check if cursor is at start
          const textContent = currentBlock?.content?.[0]?.text || "";
          const isCursorAtStart = textContent.length === 0;

          log.debug(
            `Slash analysis - Block type: ${currentBlock?.type}, Content: "${textContent}", Is empty paragraph: ${isEmptyParagraph}, Cursor at start: ${isCursorAtStart}`,
            "renderer"
          );

          if (isEmptyParagraph && isCursorAtStart) {
            event.preventDefault(); // Prevent "/" from being typed
            log.debug(
              "Slash command detected at start of empty paragraph",
              "renderer"
            );

            // Start slash command mode
            window.electronAPI?.startSlashCommand();
            return;
          }

          log.debug(
            "Slash key pressed but conditions not met for slash command",
            "renderer"
          );
        } catch (error) {
          log.debug(
            `Error checking slash command conditions: ${error}`,
            "renderer"
          );
        }
      }

      // Handle escape to cancel slash command
      if (event.key === "Escape") {
        log.debug("Escape pressed, cancelling slash command", "renderer");
        window.electronAPI?.cancelSlashCommand();
      }
    };

    // Add event listener to the editor's DOM element
    const editorDOM = editor._tiptapEditor?.view?.dom;
    if (editorDOM) {
      editorDOM.addEventListener("keydown", handleKeyDown);
      log.debug("Slash command key handler attached", "renderer");

      return () => {
        editorDOM.removeEventListener("keydown", handleKeyDown);
        log.debug("Slash command key handler removed", "renderer");
      };
    }
  }, [editor]);
};

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

  // Use the new slash command handler
  useSlashCommandHandler(editor);

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
                  // Insert at the current cursor position
                  const newBlocks = currentEditor.insertBlocks(
                    [blockConfig],
                    currentEditor.getTextCursorPosition().block,
                    "after"
                  );
                  log.debug(
                    `Successfully inserted block: ${blockKey}`,
                    "renderer"
                  );
                } else {
                  log.debug(`Unknown block type: ${blockKey}`, "renderer");
                }
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
      <BlockNoteView editor={editor} slashMenu={false} />
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
      startSlashCommand: () => void;
      cancelSlashCommand: () => void;
      onBrowserUpdate: (callback: (data: any) => void) => void;
      onBrowserRemove: (callback: (blockId: string) => void) => void;
      onNewBrowserBlock: (callback: (data: { url: string }) => void) => void;
      onSlashCommandInsert: (callback: (blockKey: string) => void) => void;
      debugLinkClick: (url: string) => void;
      testNewBrowserBlock: (url: string) => void;
      testCommunication: (callback?: (result: string) => void) => string | void;
    };
  }
}
