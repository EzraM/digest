import type {
  ContextMenuParams,
  WebContents,
  WebContentsView,
} from "electron";
import type { Command } from "../domains/browser-views/core/commands";
import type { ViewWorld } from "../domains/browser-views/core/types";
import type { Result } from "../domains/browser-views/adapter/HandleOperations";
import type { HandleRegistry } from "../domains/browser-views/adapter/HandleRegistry";
import type { ImageContextCallback } from "../domains/browser-views/adapter/ContextMenuController";
import type { LivePagesProjection } from "../types/browser";
import type { BrowsingJourneyStore } from "./BrowsingJourneyStore";
import type { CacheMissReason } from "./LivePageOpenPolicy";
import type { LivePageProjectionStore } from "./LivePageProjectionStore";

export type OpenReferenceRequest = {
  viewId: string;
  blockId: string;
  url: string;
  bounds: { x: number; y: number; width: number; height: number };
  profileId: string;
  layout?: "inline" | "full";
  referenceKind?: "site-block" | "ephemeral-url";
  placementGeneration?: number;
};

export type OpenReferenceResult = {
  journeyId?: string;
  outcome: "hit_current" | "hit_history" | "miss";
  missReason?: CacheMissReason;
  loadAvoided: boolean;
};

export interface ViewEffects {
  interpret(command: Command): void;
  attachView(id: string): boolean;
  detachView(id: string): void;
}

export interface ViewNotifications {
  notify(id: string, previous: ViewWorld, next: ViewWorld): void;
  notifyPlacementReady(placementId: string): void;
  notifyLiveReferencesChanged(projection: LivePagesProjection): void;
  notifyBrowserSelection(selection: {
    blockId: string;
    sourceUrl: string;
    sourceTitle: string;
    selectionText: string;
    selectionHtml: string;
    capturedAt: number;
  }): void;
}

export interface ViewEvents {
  attach(
    id: string,
    view: WebContentsView,
    dispatch: (command: Command) => void,
    profileId: string
  ): () => void;
  setBackgroundLinkClickCallback(
    callback: (
      url: string,
      sourceBlockId: string,
      title: string,
      profileId: string
    ) => void
  ): void;
}

export interface ViewContextMenus {
  setImageContextCallback(callback: ImageContextCallback): void;
  open(
    id: string,
    webContents: WebContents,
    params: ContextMenuParams
  ): void;
}

export interface ViewHandleOperations {
  getNavigationPosition(
    id: string
  ): Result<{ activeIndex: number; url: string }>;
  prepareNavigationEntry(
    id: string,
    requestedUrl: string,
    historyIndex?: number
  ): Result<{ activeIndex: number }>;
  getDevToolsState(id: string): Result<{ isOpen: boolean }>;
  toggleDevTools(id: string): Result<{ isOpen: boolean }>;
  goBack(id: string): Result<{ canGoBack: boolean }>;
}

export type ViewStoreDependencies = {
  now?: () => number;
  journeys?: BrowsingJourneyStore;
  livePages?: LivePageProjectionStore;
  handles?: HandleRegistry;
  notifications?: ViewNotifications;
  events?: ViewEvents;
  contextMenus?: ViewContextMenus;
  operations?: ViewHandleOperations;
  createEffects?: (
    onViewCreated: (
      id: string,
      view: WebContentsView,
      profileId: string
    ) => void
  ) => ViewEffects;
};
