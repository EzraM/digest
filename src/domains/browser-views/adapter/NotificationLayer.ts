import { WebContents } from "electron";
import { LoadState, ViewWorld } from "../core/types";
import { log } from "../../../utils/mainLogger";
import {
  BrowserLifecycleEvent,
  BrowserPresentationIdentity,
  LivePagesProjection,
} from "../../../types/browser";

const EVENTS = {
  BROWSER: {
    INITIALIZED: "browser:initialized",
    NAVIGATION: "browser:navigation-state",
    LIVE_PAGES_CHANGED: "browser:live-pages-changed",
    SELECTION: "browser:selection",
  },
};

type BrowserSelection = {
  blockId: string;
  sourceUrl: string;
  sourceTitle: string;
  selectionText: string;
  selectionHtml: string;
  capturedAt: number;
};

/**
 * Watches world state changes and notifies renderer.
 * Completely decoupled from command handling.
 */
export class NotificationLayer {
  constructor(
    private rendererWebContents: WebContents,
    private presentationForHandle: (
      id: string
    ) => BrowserPresentationIdentity | null | undefined = () => undefined,
  ) {}

  /**
   * Called after every state change.
   * Compares load and navigation state independently.
   */
  notify(id: string, prevWorld: ViewWorld, nextWorld: ViewWorld): void {
    const presentation = this.presentationForHandle(id);
    if (presentation === null) {
      log.debug(
        `[${id}] Skipping notification from inactive retained handle`,
        "NotificationLayer"
      );
      return;
    }
    const notificationId = presentation?.placementId ?? id;
    const prev = prevWorld.get(id);
    const next = nextWorld.get(id);

    if (!next) {
      // View was removed - renderer handles this via block removal
      return;
    }

    const prevLoadState = prev?.loadState.type ?? "idle";
    const nextLoadState = next.loadState.type;
    const loadStateChanged = prevLoadState !== nextLoadState;
    const navigationChanged =
      prev?.url !== next.url ||
      prev?.history.canGoBack !== next.history.canGoBack;

    if (loadStateChanged) {
      log.debug(
        `[${id}] Load state transition: ${prevLoadState} → ${nextLoadState}`,
        "NotificationLayer",
      );
      this.sendLoadStateNotification(
        notificationId,
        next.loadState,
        presentation
      );
    }

    if (navigationChanged) {
      this.sendNavigationNotification(
        notificationId,
        next.url,
        next.history.canGoBack,
        presentation,
      );
    }
  }

  notifyLiveReferencesChanged(projection: LivePagesProjection): void {
    this.send(EVENTS.BROWSER.LIVE_PAGES_CHANGED, projection);
  }

  notifyPlacementReady(identity: BrowserPresentationIdentity): void {
    this.sendLifecycleEvent({
      blockId: identity.placementId,
      success: true,
      status: "loaded",
      presentation: identity,
    });
  }

  notifyBrowserSelection(selection: BrowserSelection): void {
    this.send(EVENTS.BROWSER.SELECTION, selection);
  }

  private sendLoadStateNotification(
    id: string,
    loadState: LoadState,
    presentation?: BrowserPresentationIdentity,
  ): void {
    if (this.rendererWebContents.isDestroyed()) {
      log.warn(
        `[${id}] Renderer WebContents destroyed, skipping notification`,
        "NotificationLayer",
      );
      return;
    }

    switch (loadState.type) {
      case "loading":
        log.debug(`[${id}] Sending loading notification`, "NotificationLayer");
        this.sendLifecycleEvent({
          blockId: id,
          success: true,
          status: "loading",
          ...(presentation ? { presentation } : {}),
        });
        break;

      case "ready":
        log.debug(`[${id}] Sending ready notification`, "NotificationLayer");
        this.sendLifecycleEvent({
          blockId: id,
          success: true,
          status: "loaded",
          ...(presentation ? { presentation } : {}),
        });
        break;

      case "error":
        log.debug(
          `[${id}] Sending error notification: ${loadState.message} (${loadState.code})`,
          "NotificationLayer",
        );
        this.sendLifecycleEvent({
          blockId: id,
          success: false,
          status: "error",
          error: `Failed to load: ${loadState.message} (${loadState.code})`,
          errorCode: loadState.code,
          errorDescription: loadState.message,
          ...(presentation ? { presentation } : {}),
        });
        break;
    }
  }

  private sendLifecycleEvent(event: BrowserLifecycleEvent): void {
    this.send(EVENTS.BROWSER.INITIALIZED, event);
  }

  private send(channel: string, payload: object): void {
    if (this.rendererWebContents.isDestroyed()) {
      log.warn(
        `Renderer WebContents destroyed, skipping ${channel}`,
        "NotificationLayer",
      );
      return;
    }
    this.rendererWebContents.send(channel, payload);
  }

  private sendNavigationNotification(
    id: string,
    url: string,
    canGoBack: boolean,
    presentation?: BrowserPresentationIdentity,
  ): void {
    log.debug(
      `[${id}] Sending navigation notification for ${url}`,
      "NotificationLayer",
    );
    this.send(EVENTS.BROWSER.NAVIGATION, {
      blockId: id,
      url,
      canGoBack,
      ...(presentation ? { presentation } : {}),
    });
  }
}
