import { BlockOperation, OperationResult } from "./operations";

interface ElectronAPI {
  updateBrowser: (data: {
    blockId: string;
    url: string;
    bounds: { x: number; y: number; width: number; height: number };
  }) => void;
  removeBrowser: (blockId: string) => void;
  browser: {
    getDevToolsState: (
      blockId: string
    ) => Promise<{ success: boolean; isOpen: boolean; error?: string }>;
    toggleDevTools: (
      blockId: string
    ) => Promise<{ success: boolean; isOpen: boolean; error?: string }>;
    goBack: (
      blockId: string
    ) => Promise<{ success: boolean; canGoBack: boolean; error?: string }>;
  };
  addBlockEvent: (e: { type: "open" | "close" }) => void;
  startSlashCommand: () => void;
  cancelSlashCommand: () => void;
  updateSlashCommandResults: (
    payload: import("./slashCommand").SlashCommandResultsPayload,
  ) => void;
  selectSlashCommandBlock: (blockKey: string) => void;
  onSelectBlockType: (callback: (blockKey: string) => void) => () => void;
  onSlashCommandInsert: (callback: (blockKey: string) => void) => () => void;
  onBrowserInitialized: (
    callback: (data: {
      blockId: string;
      success: boolean;
      status?: string;
      error?: string;
      errorCode?: number;
      errorDescription?: string;
      url?: string;
    }) => void
  ) => () => void;
  onBrowserNavigation: (
    callback: (data: { blockId: string; url: string; canGoBack?: boolean }) => void
  ) => () => void;
  onNewBrowserBlock: (callback: (data: { url: string }) => void) => () => void;
  applyBlockOperations: (
    operations: BlockOperation[],
    origin?: import("./operations").TransactionOrigin
  ) => Promise<OperationResult>;
  onDocumentUpdate: (
    callback: (updateData: import("./operations").DocumentUpdate) => void
  ) => () => void;
  removeDocumentUpdateListener: (
    callback: (updateData: import("./operations").DocumentUpdate) => void
  ) => void;
  signalRendererReady: () => void;
  forwardLog: (logData: {
    level: string;
    message: string;
    timestamp: string;
    source: string;
  }) => void;
  debug: {
    toggle: () => Promise<boolean>;
    isEnabled: () => Promise<boolean>;
    getEvents: (filter?: any) => Promise<any[]>;
    getSessionEvents: () => Promise<any[]>;
    clearEvents: () => Promise<{ success: boolean }>;
    onModeChanged: (callback: (enabled: boolean) => void) => () => void;
    onNewEvent: (callback: (event: any) => void) => () => void;
    onInitialEvents: (callback: (events: any[]) => void) => () => void;
  };
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
