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
import { useCreateBlockNote, SuggestionMenuController } from "@blocknote/react";
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

// Store current editor globally to access in IPC handlers
let currentEditor: any = null;

// Function to create a new browser block with the specified URL
const createNewBrowserBlock = (url: string): void => {
  if (currentEditor) {
    insertOrUpdateBlock(currentEditor, {
      type: "site",
      props: { url: url },
    });
  }
};

// Custom suggestion menu component that triggers HUD instead of showing BlockNote's menu
function CustomSlashMenu(): null {
  // Always return null since we don't want to render anything
  // The HUD overlay will be shown instead
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
              case "site":
                insertOrUpdateBlock(currentEditor, { type: "site" });
                break;
              case "paragraph":
                insertOrUpdateBlock(currentEditor, { type: "paragraph" });
                break;
              case "heading":
                insertOrUpdateBlock(currentEditor, {
                  type: "heading",
                  props: { level: 1 },
                });
                break;
              case "heading_2":
                insertOrUpdateBlock(currentEditor, {
                  type: "heading",
                  props: { level: 2 },
                });
                break;
              case "heading_3":
                insertOrUpdateBlock(currentEditor, {
                  type: "heading",
                  props: { level: 3 },
                });
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

  return (
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
