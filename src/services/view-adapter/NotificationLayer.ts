import { WebContents } from 'electron';
import { ViewWorld, ViewStatus } from '../view-core/types';
import { log } from '../../utils/mainLogger';

const EVENTS = {
  BROWSER: {
    INITIALIZED: 'browser:initialized',
    NAVIGATION: 'browser:navigation-state',
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
   * Compares old and new status to determine what notifications to send.
   */
  notify(id: string, prevWorld: ViewWorld, nextWorld: ViewWorld): void {
    const prev = prevWorld.get(id);
    const next = nextWorld.get(id);

    if (!next) {
      // View was removed - renderer handles this via block removal
      return;
    }

    const prevStatus = prev?.status.type ?? 'idle';
    const nextStatus = next.status.type;

    // Only notify on status transitions
    if (prevStatus === nextStatus) return;

    log.debug(
      `[${id}] Status transition: ${prevStatus} → ${nextStatus}`,
      'NotificationLayer'
    );

    this.sendStatusNotification(id, next.status, next.url);
  }

  private sendStatusNotification(id: string, status: ViewStatus, url: string): void {
    if (this.rendererWebContents.isDestroyed()) {
      log.warn(
        `[${id}] Renderer WebContents destroyed, skipping notification`,
        'NotificationLayer'
      );
      return;
    }

    switch (status.type) {
      case 'loading':
        log.debug(
          `[${id}] Sending loading notification`,
          'NotificationLayer'
        );
        this.rendererWebContents.send(EVENTS.BROWSER.INITIALIZED, {
          blockId: id,
          success: true,
          status: 'loading',
        });
        break;

      case 'ready':
        log.debug(
          `[${id}] Sending ready notification`,
          'NotificationLayer'
        );
        this.rendererWebContents.send(EVENTS.BROWSER.INITIALIZED, {
          blockId: id,
          success: true,
          status: 'loaded',
        });
        this.rendererWebContents.send(EVENTS.BROWSER.NAVIGATION, {
          blockId: id,
          url,
          canGoBack: status.canGoBack,
        });
        break;

      case 'error':
        log.debug(
          `[${id}] Sending error notification: ${status.message} (${status.code})`,
          'NotificationLayer'
        );
        this.rendererWebContents.send(EVENTS.BROWSER.INITIALIZED, {
          blockId: id,
          success: false,
          error: `Failed to load: ${status.message} (${status.code})`,
          errorCode: status.code,
          errorDescription: status.message,
        });
        break;
    }
  }
}
