import { BlockOperation, OperationResult } from "./operations";
import { DocumentRecord, DocumentTreeNode, ProfileRecord } from "./documents";

interface ElectronAPI {
  clipboard: {
    readText: () => string;
    readHTML: () => string;
    availableFormats: () => string[];
  };
  updateBrowser: (data: {
    blockId: string;
    url: string;
    bounds: { x: number; y: number; width: number; height: number };
    profileId: string;
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
    createBlock: (url: string, sourceBlockId?: string) => void;
  };
  addBlockEvent: (e: { type: "open" | "close" }) => void;
  startSlashCommand: () => void;
  cancelSlashCommand: () => void;
  updateSlashCommandResults: (
    payload: import("./slashCommand").SlashCommandResultsPayload
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
    callback: (data: {
      blockId: string;
      url: string;
      canGoBack?: boolean;
    }) => void
  ) => () => void;
  onBrowserScrollForward: (
    callback: (data: {
      blockId: string;
      direction: "up" | "down";
      deltaY: number;
    }) => void
  ) => () => void;
  onNewBrowserBlock: (
    callback: (data: { url: string; sourceBlockId?: string }) => void
  ) => () => void;
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
  profiles: {
    list: () => Promise<ProfileRecord[]>;
    create: (payload: {
      name: string;
      icon?: string | null;
      color?: string | null;
    }) => Promise<ProfileRecord>;
    delete: (profileId: string) => Promise<{ success: boolean }>;
    onUpdated: (
      callback: (event: { profiles: ProfileRecord[] }) => void
    ) => () => void;
  };
  documents: {
    getActive: () => Promise<DocumentRecord | null>;
    getTree: (profileId?: string | null) => Promise<DocumentTreeNode[]>;
    create: (payload: {
      profileId: string;
      title?: string | null;
      parentDocumentId?: string | null;
      position?: number;
    }) => Promise<DocumentRecord>;
    rename: (payload: {
      documentId: string;
      title: string;
    }) => Promise<DocumentRecord>;
    delete: (documentId: string) => Promise<{ success: boolean }>;
    move: (payload: {
      documentId: string;
      newParentId: string | null;
      position: number;
    }) => Promise<DocumentRecord>;
    moveToProfile: (payload: {
      documentId: string;
      newProfileId: string;
    }) => Promise<DocumentRecord>;
    switch: (documentId: string) => Promise<DocumentRecord>;
    onTreeUpdated: (
      callback: (data: { profileId: string; tree: DocumentTreeNode[] }) => void
    ) => () => void;
    onDocumentSwitched: (
      callback: (data: { document: DocumentRecord | null }) => void
    ) => () => void;
  };
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
    showDebug?: () => Promise<void>;
  }
}
