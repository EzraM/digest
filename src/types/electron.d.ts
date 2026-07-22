import { BlockOperation, OperationResult } from "./operations";
import { DocumentRecord, DocumentTreeNode, ProfileRecord } from "./documents";
import {
  BrowserLifecycleEvent,
  BrowserPageInfo,
  LivePagesProjection,
} from "./browser";

interface ElectronAPI {
  clipboard: {
    readText: () => string;
    readHTML: () => string;
    availableFormats: () => string[];
    writeImage: (arrayBuffer: ArrayBuffer) => void;
  };
  updateBrowser: (data: {
    viewId: string;
    blockId: string;
    url: string;
    bounds: { x: number; y: number; width: number; height: number };
    profileId: string;
    layout?: "inline" | "full";
    referenceKind?: "site-block" | "ephemeral-url";
    placementGeneration?: number;
  }) => void;
  removeBrowser: (blockId: string) => void;
  removeView: (viewId: string, placementGeneration?: number) => void;
  browser: {
    getDevToolsState: (
      viewId: string
    ) => Promise<{ success: boolean; isOpen: boolean; error?: string }>;
    toggleDevTools: (
      viewId: string
    ) => Promise<{ success: boolean; isOpen: boolean; error?: string }>;
    goBack: (
      viewId: string
    ) => Promise<{ success: boolean; canGoBack: boolean; error?: string }>;
    reload: (
      viewId: string
    ) => Promise<{ success: boolean; error?: string }>;
    getPageInfo: (viewId: string) => Promise<BrowserPageInfo>;
    getLivePages: () => Promise<LivePagesProjection>;
  };
  addBlockEvent: (e: { type: "open" | "close" }) => void;
  onBrowserInitialized: (
    callback: (data: BrowserLifecycleEvent) => void
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
  onBrowserSelection: (
    callback: (data: {
      blockId: string;
      sourceUrl: string;
      sourceTitle: string;
      selectionText: string;
      selectionHtml: string;
      capturedAt: number;
    }) => void
  ) => () => void;
  onBrowserImageClipped: (
    callback: (data: {
      blockId: string;
      sourceUrl: string;
      sourceTitle: string;
      originalImageUrl: string;
      altText: string;
      imageId: string;
      localImageUrl: string;
      width: number | null;
      height: number | null;
      capturedAt: number;
    }) => void
  ) => () => void;
  captureBrowserSelection: (blockId: string) => Promise<{
    success: boolean;
    selectionText?: string;
    selectionHtml?: string;
    error?: string;
  }>;
  onLivePagesChanged: (
    callback: (data: import("./browser").LivePagesProjection) => void
  ) => () => void;
  onInsertLink: (
    callback: (data: {
      url: string;
      title: string;
      sourceBlockId?: string;
    }) => void
  ) => () => void;
  onLinkCaptured: (
    callback: (data: { url: string; title: string; capturedAt: number }) => void
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
    rename: (payload: {
      profileId: string;
      name: string;
    }) => Promise<ProfileRecord>;
    updateSettings: (payload: {
      profileId: string;
      settings: import("./documents").ProfileSettings;
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
  image: {
    saveImage: (params: {
      arrayBuffer: ArrayBuffer;
      mimeType: string;
      fileName: string;
      width?: number;
      height?: number;
      documentId?: string;
    }) => Promise<{
      id: string;
      url: string;
      width: number | null;
      height: number | null;
    }>;
    getImageInfo: (id: string) => Promise<{
      id: string;
      file_name: string;
      mime_type: string;
      byte_length: number;
      width: number | null;
      height: number | null;
      created_at: number;
      document_id: string | null;
    } | null>;
    downloadAndSaveImage: (params: {
      url: string;
      documentId?: string;
      width?: number;
      height?: number;
      fileName?: string;
    }) => Promise<{
      id: string;
      url: string;
      width: number | null;
      height: number | null;
    } | null>;
    deleteImage: (imageId: string) => Promise<boolean>;
    attachImageToDocument: (params: {
      imageId: string;
      documentId: string;
    }) => Promise<boolean>;
  };
  search: {
    execute: (
      query: string,
      context?: {
        documentId?: string;
        excludeBlockIds?: string[];
        minScore?: number;
      },
      limit?: number
    ) => Promise<
      Array<{
        blockId: string;
        documentId: string;
        blockType: string;
        content: string;
        score: number;
        metadata: Record<string, unknown>;
      }>
    >;
    getStats: () => Promise<{
      indexedBlocks: number;
      lastIndexedAt?: number;
    }>;
    webSearch: (
      query: string,
      options?: { country?: string; count?: number }
    ) => Promise<Array<{ title: string; url: string; description: string }>>;
  };
  onDownloadStarted: (
    callback: (data: {
      id: string;
      fileName: string;
      url: string;
      totalBytes: number;
      savePath: string;
    }) => void
  ) => () => void;
  onDownloadProgress: (
    callback: (data: {
      id: string;
      receivedBytes: number;
      totalBytes: number;
    }) => void
  ) => () => void;
  onDownloadCompleted: (
    callback: (data: {
      id: string;
      savePath: string;
      fileName: string;
    }) => void
  ) => () => void;
  onDownloadFailed: (
    callback: (data: { id: string }) => void
  ) => () => void;
  onDownloadInsertFileBlock: (
    callback: (data: {
      fileName: string;
      savePath: string;
      url: string;
    }) => void
  ) => () => void;
  downloadShowInFolder: (filePath: string) => void;
  downloadCancel: (downloadId: string) => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
    showDebug?: () => Promise<void>;
  }
}
