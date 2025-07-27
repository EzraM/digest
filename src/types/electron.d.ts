import { BlockOperation, OperationResult } from "./operations";

interface ElectronAPI {
  updateBrowser: (data: {
    blockId: string;
    url: string;
    bounds: { x: number; y: number; width: number; height: number };
  }) => void;
  removeBrowser: (blockId: string) => void;
  addBlockEvent: (e: { type: "open" | "close" }) => void;
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
  updatePromptOverlayBounds: (bounds: { x: number; y: number; width: number; height: number }) => void;
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
  onPromptOverlayCreateBlocks: (
    callback: (data: { xmlResponse: string; originalInput: string }) => void
  ) => () => void;

  forwardLog: (logData: {
    level: string;
    message: string;
    timestamp: string;
    source: string;
  }) => void;

  // Block operations for unified processing with transaction metadata
  applyBlockOperations: (operations: any[], origin?: any) => Promise<any>;

  // Document update handling
  onDocumentUpdate: (callback: (updateData: any) => void) => () => void;
  removeDocumentUpdateListener: (callback: (updateData: any) => void) => void;

  // Signal renderer is ready to receive document updates
  signalRendererReady: () => void;

  // Update document state (continuous sync)
  updateDocumentState: (documentState: any) => void;

  // Debug functionality
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
