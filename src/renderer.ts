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
import { createElement as h } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";

const notes = [
  { noteId: 1, url: "https://electron.org" },
  { noteId: 2, url: "https://github.com" },
];

const root = createRoot(document.getElementById("root"));
root.render(App());

function App() {
  return h("div", {}, [
    h("textarea", {}),
    h("div", { style: { height: "2000px", width: "100%", color: "gray" } }),
  ]);
}

window.addEventListener(
  "scroll",
  (e) => {
    window.electronAPI.setScroll(window.scrollY);
  },
  false
);
