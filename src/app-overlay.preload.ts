// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
import { contextBridge, ipcRenderer } from "electron";
import { log } from "./utils/mainLogger";
import { SlashCommandResultsPayload } from "./types/slashCommand";

const EVENTS = {
  BLOCK_MENU: {
    OPEN: "block-menu:open",
    CLOSE: "block-menu:close",
    SELECT: "block-menu:select",
  },
} as const;

// Add logging for all IPC events
const originalSend = ipcRenderer.send;
ipcRenderer.send = function (channel: string, ...args: any[]) {
  log.debug(
    `Sending IPC event on channel: ${channel}, args: ${JSON.stringify(args)}`,
    "app-overlay:preload"
  );
  return originalSend.apply(ipcRenderer, [channel, ...args]);
};

// Add logging for window events
window.addEventListener("blur", () => {
  log.debug("Window blur event in preload context", "app-overlay:preload");
});

window.addEventListener("focus", () => {
  log.debug("Window focus event in preload context", "app-overlay:preload");
});

window.addEventListener("click", (event) => {
  log.debug(
    `Window click event in preload context, target: ${event.target}`,
    "app-overlay:preload"
  );
});

contextBridge.exposeInMainWorld("electronAPI", {
  selectBlockType: (blockKey: string) => {
    log.debug(`Selecting block with key: ${blockKey}`, "app-overlay:preload");
    ipcRenderer.send(EVENTS.BLOCK_MENU.SELECT, blockKey);
  },
  cancelSlashCommand: () => {
    log.debug("Cancelling slash command from HUD", "app-overlay:preload");
    ipcRenderer.send("slash-command:cancel");
  },
  onSlashCommandResults: (
    callback: (payload: SlashCommandResultsPayload) => void,
  ) => {
    const channel = "slash-command:update-results";
    const handler = (_event: unknown, payload: SlashCommandResultsPayload) => {
      callback(payload);
    };
    ipcRenderer.on(channel, handler);
    return () => {
      ipcRenderer.removeListener(channel, handler);
    };
  },
  notifySlashCommandOverlayReady: () => {
    log.debug("HUD overlay ready signal sent", "app-overlay:preload");
    ipcRenderer.send("slash-command:overlay-ready");
  },
});
