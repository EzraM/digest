import type {
  BrowserWindow,
  DidCreateWindowDetails,
  HandlerDetails,
  WindowOpenHandlerResponse,
} from "electron";
import { log } from "../utils/mainLogger";

type PopupWindow = Pick<BrowserWindow, "close" | "isDestroyed" | "on">;

/**
 * Owns transient, opener-bound browser windows for one Digest window.
 *
 * Popups are not browsing journeys: they are deliberately kept out of the
 * handle registry, presentation world, and live-page cache.
 */
export class BrowserPopupController {
  private readonly windowsByOpener = new Map<string, Set<PopupWindow>>();

  constructor(private readonly parentWindow: BrowserWindow) {}

  decide(details: HandlerDetails): WindowOpenHandlerResponse {
    if (!isSafePopupUrl(details.url)) {
      log.warn(
        `Denied popup with unsupported protocol: ${redactUrl(details.url)}`,
        "BrowserPopupController"
      );
      return { action: "deny" };
    }

    return {
      action: "allow",
      outlivesOpener: false,
      overrideBrowserWindowOptions: {
        parent: this.parentWindow,
        modal: false,
        autoHideMenuBar: true,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
          webSecurity: true,
          allowRunningInsecureContent: false,
        },
      },
    };
  }

  created(
    openerHandleId: string,
    window: BrowserWindow,
    details: DidCreateWindowDetails
  ): void {
    let windows = this.windowsByOpener.get(openerHandleId);
    if (!windows) {
      windows = new Set();
      this.windowsByOpener.set(openerHandleId, windows);
    }
    windows.add(window);

    log.debug(
      `[${openerHandleId}] Popup created for ${redactUrl(details.url)}`,
      "BrowserPopupController"
    );

    window.on("closed", () => {
      this.forget(openerHandleId, window);
      log.debug(
        `[${openerHandleId}] Popup closed`,
        "BrowserPopupController"
      );
    });
  }

  closeForOpener(openerHandleId: string): void {
    const windows = this.windowsByOpener.get(openerHandleId);
    if (!windows) return;
    this.windowsByOpener.delete(openerHandleId);
    for (const window of windows) {
      if (!window.isDestroyed()) window.close();
    }
  }

  closeAll(): void {
    const openerIds = Array.from(this.windowsByOpener.keys());
    for (const openerId of openerIds) this.closeForOpener(openerId);
  }

  private forget(openerHandleId: string, window: PopupWindow): void {
    const windows = this.windowsByOpener.get(openerHandleId);
    if (!windows) return;
    windows.delete(window);
    if (windows.size === 0) this.windowsByOpener.delete(openerHandleId);
  }
}

function isSafePopupUrl(rawUrl: string): boolean {
  try {
    const protocol = new URL(rawUrl).protocol;
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}

function redactUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return `<${url.protocol.replace(":", "")}-url>`;
    }
    return `${url.origin}${url.pathname}`;
  } catch {
    return "<invalid-url>";
  }
}
