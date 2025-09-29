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
    return ipcRenderer.invoke("content-available");
  },
  getCostSummary: () => {
    return ipcRenderer.invoke("content-cost-summary");
  },
  onFocusRequest: (callback: () => void) => {
    const subscription = () => {
      log.debug("Received focus request", "prompt-overlay:preload");
      callback();
    };
    ipcRenderer.on("prompt-overlay:focus-input", subscription);
    return () => {
      ipcRenderer.removeListener("prompt-overlay:focus-input", subscription);
    };
  },
  onCostUpdate: (
    callback: (costData: { queryCost: number; sessionTotal: number }) => void
  ) => {
    const subscription = (
      _: any,
      costData: { queryCost: number; sessionTotal: number }
    ) => {
      log.debug(
        `Received cost update: ${JSON.stringify(costData)}`,
        "prompt-overlay:preload"
      );
      callback(costData);
    };
    ipcRenderer.on("cost-update", subscription);
    return () => {
      ipcRenderer.removeListener("cost-update", subscription);
    };
  },
});
