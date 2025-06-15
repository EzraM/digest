import { contextBridge, ipcRenderer } from "electron";
import { log } from "./utils/rendererLogger";

const EVENTS = {
  PROMPT: {
    SUBMIT: "prompt:submit",
  },
} as const;

contextBridge.exposeInMainWorld("electronAPI", {
  submitPrompt: (input: string) => {
    log.debug(`Submitting prompt: ${input}`, "prompt-overlay:preload");
    return ipcRenderer.invoke("prompt-overlay:submit", input);
  },
  isIntelligentUrlAvailable: () => {
    return ipcRenderer.invoke("intelligent-url-available");
  },
});
