interface ElectronAPI {
  updateBrowserUrl: (data: { blockId: string; url: string }) => void;
  updateBrowser: (data: {
    x: number;
    y: number;
    width: number;
    height: number;
    blockId: string;
  }) => void;
  removeBrowser: (blockId: string) => void;
  addBlockEvent: (event: { type: "open" | "close" }) => void;
  onSelectBlockType: (callback: (blockKey: string) => void) => () => void;
  onBrowserInitialized: (
    callback: (data: {
      blockId: string;
      success: boolean;
      status?: string;
      error?: string;
    }) => void
  ) => () => void;
  onNewBrowserBlock: (callback: (data: { url: string }) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
