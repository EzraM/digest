// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
import { contextBridge, ipcRenderer } from "electron";
import { log } from "./utils/mainLogger";

declare global {
  interface Window {
    electronAPI: {
      setUrl: (url: string) => void;
      updateBrowser: (browserLayout: {
        x: number;
        y: number;
        width: number;
        height: number;
        blockId: string;
      }) => void;
      updateBrowserUrl: (browserUrl: { blockId: string; url: string }) => void;
      addBlockEvent: (e: { type: "open" | "close" }) => void;
      onSelectBlockType: (callback: (blockKey: string) => void) => void;
      onBrowserInitialized: (
        callback: (data: {
          blockId: string;
          success: boolean;
          error?: string;
          status?: "created" | "loaded" | "existing";
        }) => void
      ) => () => void;
    };
  }
}

const EVENTS = {
  BLOCK_MENU: {
    OPEN: "block-menu:open",
    CLOSE: "block-menu:close",
    SELECT: "block-menu:select",
  },
  BROWSER: {
    INITIALIZED: "browser:initialized",
  },
} as const;

contextBridge.exposeInMainWorld("electronAPI", {
  //setScroll: (scrollY: number) => ipcRenderer.send("set-scroll", scrollY),
  setUrl: (url: string) => ipcRenderer.send("set-url", url),
  updateBrowser: (browserLayout: {
    x: number;
    y: number;
    width: number;
    height: number;
    blockId: string;
  }) => ipcRenderer.send("set-layout", browserLayout),
  updateBrowserUrl: (browserUrl: { blockId: string; url: string }) =>
    ipcRenderer.send("update-browser-url", browserUrl),
  addBlockEvent: (e: { type: "open" | "close" }) => {
    const eventName =
      e.type === "open" ? EVENTS.BLOCK_MENU.OPEN : EVENTS.BLOCK_MENU.CLOSE;
    log.debug(`Sending event: ${eventName}`, "preload");
    ipcRenderer.send(eventName);
  },
  onSelectBlockType: (callback: (blockKey: string) => void) => {
    const subscription = (_: any, blockKey: string) => {
      log.debug(`Received block selection: ${blockKey}`, "preload");
      callback(blockKey);
    };
    ipcRenderer.on(EVENTS.BLOCK_MENU.SELECT, subscription);
    return () => {
      ipcRenderer.removeListener(EVENTS.BLOCK_MENU.SELECT, subscription);
    };
  },
  onBrowserInitialized: (
    callback: (data: {
      blockId: string;
      success: boolean;
      error?: string;
      status?: "created" | "loaded" | "existing";
    }) => void
  ) => {
    const subscription = (
      _: any,
      data: {
        blockId: string;
        success: boolean;
        error?: string;
        status?: "created" | "loaded" | "existing";
      }
    ) => {
      log.debug(
        `Browser initialization status for ${data.blockId}: ${data.success}${
          data.status ? ` (${data.status})` : ""
        }`,
        "preload"
      );
      callback(data);
    };
    ipcRenderer.on(EVENTS.BROWSER.INITIALIZED, subscription);
    return () => {
      ipcRenderer.removeListener(EVENTS.BROWSER.INITIALIZED, subscription);
    };
  },
});
