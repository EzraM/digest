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
import { createElement as h, useCallback, useEffect, useReducer } from "react";
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
  SuggestionMenuProseMirrorPlugin,
  defaultBlockSchema,
  defaultBlockSpecs,
  filterSuggestionItems,
  insertOrUpdateBlock,
} from "@blocknote/core";
import { site } from "./Browser/Browser";
import { RiPagesFill } from "react-icons/ri";

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
root.render(h(App, {}));

const schema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    site: site,
  },
});

// slash menu item to insert a Site
const addSite = (editor: typeof schema.BlockNoteEditor) => ({
  title: "Site",
  onItemClick: () => {
    insertOrUpdateBlock(editor, {
      type: "site",
    });
  },
  aliases: ["site", "url", "/"],
  group: "Browser",
  icon: h(RiPagesFill, {}),
});

function SuggestionStub(
  props: SuggestionMenuProps<DefaultReactSuggestionItem>
) {
  // props.items
  // props.loadingState
  // props.onItemClick
  // props.selectedIndex
  console.log(`loading state`, props.loadingState);
  console.log(`items`, props.items);
  // onItemClick is not serialiable
  useEffect(() => {
    console.log("[Suggestion Stub] add block event");
    window.electronAPI.addBlockEvent({ type: "open" });
    return () => {
      window.electronAPI.addBlockEvent({ type: "close" });
    };
  }, []);

  // return null;
  return h(
    "div",
    { className: "slash-menu" },
    props.items.map((item, index) =>
      h(
        "div",
        {
          key: `item.key-${index}`,
          className: `slash-menu-item${
            props.selectedIndex === index ? " selected" : ""
          }`,
          onClick: () => props.onItemClick?.(item),
        },
        [item.title]
      )
    )
  );
}

function App() {
  const editor = useCreateBlockNote({
    schema,
  });

  return h("div", {}, [
    h(BlockNoteView, { editor, slashMenu: false }, [
      // replaces default slash menu
      h(SuggestionMenuController, {
        triggerCharacter: "/",
        suggestionMenuComponent: SuggestionStub,
        getItems: async (query) =>
          filterSuggestionItems(
            [...getDefaultReactSlashMenuItems(editor), addSite(editor)],
            query
          ),
      }),
    ]),
    h("div", { style: { height: "2000px", width: "100%", color: "gray" } }),
  ]);
}
