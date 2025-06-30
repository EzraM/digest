import { BlockOperation, OperationResult } from "./operations";

interface ElectronAPI {
  setUrl: (url: string) => void;
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
  startSlashCommand: () => void;
  cancelSlashCommand: () => void;
  onSelectBlockType: (callback: (blockKey: string) => void) => () => void;
  onSlashCommandInsert: (callback: (blockKey: string) => void) => () => void;
  onBrowserInitialized: (
    callback: (data: {
      blockId: string;
      success: boolean;
      status?: string;
      error?: string;
    }) => void
  ) => () => void;
  onNewBrowserBlock: (callback: (data: { url: string }) => void) => () => void;
  processIntelligentUrl: (input: string, context?: any) => Promise<any>;
  isIntelligentUrlAvailable: () => Promise<boolean>;
  processInputCreateBlocks: (
    input: string,
    context?: any
  ) => Promise<{
    success: boolean;
    blocks?: any[];
    error?: string;
    metadata?: any;
  }>;
  isBlockCreationAvailable: () => Promise<boolean>;
  submitPrompt: (prompt: string) => Promise<{
    success: boolean;
    error?: string;
  }>;
  focusPromptOverlay: () => void;
  updateDocumentState: (documentState: any) => void;

  // New block operation methods with transaction metadata support
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

  forwardLog: (logData: {
    level: string;
    message: string;
    timestamp: string;
    source: string;
  }) => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
