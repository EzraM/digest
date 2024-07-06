// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  setScroll: (scrollY: number) => ipcRenderer.send("set-scroll", scrollY),
  setUrl: (url: string) => ipcRenderer.send("set-url", url),
  updateBrowser: (browserLayout: {
    x: number;
    y: number;
    width: number;
    height: number;
    blockId: string;
  }) => ipcRenderer.send("update-browser", browserLayout),
  updateBrowserUrl: (browserUrl: { blockId: string; url: string }) =>
    ipcRenderer.send("update-browser-url", browserUrl),
});
