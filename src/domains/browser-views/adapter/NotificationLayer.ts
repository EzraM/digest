import { WebContents } from "electron";
import { LoadState, ViewWorld } from "../core/types";
import { log } from "../../../utils/mainLogger";

const EVENTS = {
  BROWSER: {
    INITIALIZED: "browser:initialized",
    NAVIGATION: "browser:navigation-state",
  },
};

/**
 * Watches world state changes and notifies renderer.
 * Completely decoupled from command handling.
 */
export class NotificationLayer {
  constructor(private rendererWebContents: WebContents) {}

  /**
   * Called after every state change.
   * Compares load and navigation state independently.
   */
  notify(id: string, prevWorld: ViewWorld, nextWorld: ViewWorld): void {
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
      this.sendLoadStateNotification(id, next.loadState);
    }

    if (navigationChanged) {
      this.sendNavigationNotification(
        id,
        next.url,
        next.history.canGoBack,
      );
    }
  }

  private sendLoadStateNotification(
    id: string,
    loadState: LoadState,
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
        this.rendererWebContents.send(EVENTS.BROWSER.INITIALIZED, {
          blockId: id,
          success: true,
          status: "loading",
        });
        break;

      case "ready":
        log.debug(`[${id}] Sending ready notification`, "NotificationLayer");
        this.rendererWebContents.send(EVENTS.BROWSER.INITIALIZED, {
          blockId: id,
          success: true,
          status: "loaded",
        });
        break;

      case "error":
        log.debug(
          `[${id}] Sending error notification: ${loadState.message} (${loadState.code})`,
          "NotificationLayer",
        );
        this.rendererWebContents.send(EVENTS.BROWSER.INITIALIZED, {
          blockId: id,
          success: false,
          error: `Failed to load: ${loadState.message} (${loadState.code})`,
          errorCode: loadState.code,
          errorDescription: loadState.message,
        });
        break;
    }
  }

  private sendNavigationNotification(
    id: string,
    url: string,
    canGoBack: boolean,
  ): void {
    if (this.rendererWebContents.isDestroyed()) {
      log.warn(
        `[${id}] Renderer WebContents destroyed, skipping navigation notification`,
        "NotificationLayer",
      );
      return;
    }
    log.debug(
      `[${id}] Sending navigation notification for ${url}`,
      "NotificationLayer",
    );
    this.rendererWebContents.send(EVENTS.BROWSER.NAVIGATION, {
      blockId: id,
      url,
      canGoBack,
    });
  }
}
