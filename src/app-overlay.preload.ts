// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
import { contextBridge, ipcRenderer } from "electron";
import { log } from "./utils/mainLogger";

const EVENTS = {
  BLOCK_MENU: {
    OPEN: "block-menu:open",
    CLOSE: "block-menu:close",
    SELECT: "block-menu:select",
  },
} as const;

contextBridge.exposeInMainWorld("electronAPI", {
  selectBlockType: (blockKey: string) => {
    log.debug(`Selecting block with key: ${blockKey}`, "app-overlay:preload");
    ipcRenderer.send(EVENTS.BLOCK_MENU.SELECT, blockKey);
  },
});
