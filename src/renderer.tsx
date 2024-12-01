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
import React, { useCallback, useEffect, useReducer } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";

import "@blocknote/core/fonts/inter.css";
import {
  useCreateBlockNote,
  SuggestionMenuController,
  getDefaultReactSlashMenuItems,
  SuggestionMenuProps,
  DefaultReactSuggestionItem,
} from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";
import {
  BlockNoteSchema,
  defaultBlockSpecs,
  filterSuggestionItems,
  insertOrUpdateBlock,
} from "@blocknote/core";
import { site } from "./Browser/Browser";
import { RiPagesFill } from "react-icons/ri";
import { log } from "./utils/rendererLogger";

// features
// you can add a note
// you can edit a note
// you can click a "go" button which treats a note as a url, opening a browser
// ...
// you can add a note in-between old notes
// you can reorder notes
// you can delete a note

// getBoundingClientRect
// IntersectionObserver

// component side-effects:
// key, url, {rect}
// key, url, off-screen

const root = createRoot(document.getElementById("root"));
root.render(<App />);

const schema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    site: site,
  },
});

// slash menu item to insert a Site
const addSite = (editor: typeof schema.BlockNoteEditor) => ({
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

function SuggestionStub(
  props: SuggestionMenuProps<DefaultReactSuggestionItem>
): JSX.Element | null {
  useEffect(() => {
    log.debug("Opening block menu", "SuggestionStub");
    window.electronAPI.addBlockEvent({ type: "open" });

    const handleBlockSelect = (blockKey: string) => {
      log.debug(
        `Finding item with key: ${blockKey} in items: ${JSON.stringify(
          props.items
        )}`,
        "SuggestionStub"
      );

      const item = props.items.find((item) => {
        return (item as any).key === blockKey;
      });

      if (item) {
        log.debug(
          `Found matching item: ${JSON.stringify(item)}`,
          "SuggestionStub"
        );
        props.onItemClick(item);
      } else {
        log.warn(
          `No matching item found for key: ${blockKey}`,
          "SuggestionStub"
        );
      }
    };

    const cleanup = window.electronAPI.onSelectBlockType(handleBlockSelect);

    return () => {
      log.debug("Closing block menu", "SuggestionStub");
      window.electronAPI.addBlockEvent({ type: "close" });
      cleanup?.();
    };
  }, [props.items, props.onItemClick]);

  return null;
}

function App() {
  const editor = useCreateBlockNote({
    schema,
  });

  return (
    <div>
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
