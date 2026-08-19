import {
  DeleteDocumentResult,
  DocumentRecord,
  DocumentTreeNode,
  ProfileRecord,
} from "./documents";
import {
  BrowserLifecycleEvent,
  BrowserPageInfo,
  DetachPlacementIPCRequest,
  LivePagesProjection,
  OpenReferenceIPCRequest,
} from "./browser";

interface ElectronAPI {
  modules: {
    invoke: (
      moduleId: string,
      method: string,
      input: unknown
    ) => Promise<unknown>;
    onEvent: (
      callback: (
        event: import("../services/ModuleIPCRegistry").ModuleEventEnvelope
      ) => void
    ) => () => void;
  };
  integrations: {
    list: () => Promise<import("./integrations").IntegrationsView>;
    connect: (
      integrationId: string
    ) => Promise<import("./integrations").ConnectedIntegrationAccountView>;
    cancelConnect: (integrationId: string) => Promise<void>;
    disconnect: (integrationId: string, accountId: string) => Promise<void>;
  };
  windows: {
    openRoute: (route: {
      kind: "url" | "doc";
      url?: string;
      documentId?: string;
      sourceBlockId?: string;
      fallbackLinkLabel?: string;
    }) => Promise<{ windowId: string }>;
  };
  clipboard: {
    readText: () => string;
    readHTML: () => string;
    availableFormats: () => string[];
    writeImage: (arrayBuffer: ArrayBuffer) => void;
  };
  updateBrowser: (data: OpenReferenceIPCRequest) => void;
  removeBrowser: (blockId: string) => void;
  removeView: (request: DetachPlacementIPCRequest) => void;
  browser: {
    getPlacementId: () => Promise<{ placementId: string }>;
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
  collaboration: {
    subscribe: (
      documentId: string,
      stateVector: Uint8Array
    ) => Promise<{
      document: DocumentRecord;
      update: Uint8Array;
    }>;
    applyUpdate: (
      documentId: string,
      updateId: string,
      update: Uint8Array
    ) => Promise<{ accepted: boolean; duplicate: boolean }>;
    unsubscribe: (
      documentId: string
    ) => Promise<{ unsubscribed: boolean }>;
    onUpdate: (
      callback: (event: {
        documentId: string;
        updateId: string;
        update: Uint8Array;
        producerRendererId: number;
      }) => void
    ) => () => void;
  };
  notebook: {
    insertContent: (
      command: import("../domains/notebook-content/core/NotebookAddress").InsertNotebookContent
    ) => Promise<
      import("../domains/notebook-content/core/NotebookAddress").NotebookWriteResult
    >;
  };
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
    reorder: (profileIds: string[]) => Promise<ProfileRecord[]>;
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
    delete: (documentId: string) => Promise<DeleteDocumentResult>;
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
  asset: {
    save: (params: {
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
    info: (id: string) => Promise<{
      id: string;
      name: string;
      mediaType: string;
      byteLength: number;
      width: number | null;
      height: number | null;
      createdAt: number;
      documentId: string | null;
    } | null>;
    importUrl: (params: {
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
    release: (assetId: string) => Promise<boolean>;
    attach: (params: {
      assetId: string;
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
      id: string;
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
