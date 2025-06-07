import { BrowserWindow, WebContentsView } from "electron";
import path from "path";
import { viteConfig } from "../config/vite";
import { OverlayState } from "../types/window";
import { log } from "../utils/mainLogger";

export class AppOverlay {
  private overlay: WebContentsView | null = null;
  private baseWindow: BrowserWindow;
  private state: OverlayState;

  constructor(state: OverlayState, baseWindow: BrowserWindow) {
    this.state = state;
    this.baseWindow = baseWindow;
    log.debug("AppOverlay service initialized", "AppOverlay");
  }

  private createOverlay() {
    if (!this.overlay) {
      log.debug("Creating new overlay view", "AppOverlay");
      const appOverlay = new WebContentsView({
        webPreferences: {
          preload: path.join(__dirname, `app-overlay.preload.js`),
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: false,
          webSecurity: true,
          allowRunningInsecureContent: false,
        },
      });

      appOverlay.setBounds({ x: 800, y: 300, height: 400, width: 500 });

      appOverlay.webContents.session.webRequest.onHeadersReceived(
        (details, callback) => {
          callback({
            responseHeaders: {
              ...details.responseHeaders,
              "Content-Security-Policy": [
                "default-src 'self'; " +
                  "script-src 'self' 'unsafe-inline'; " + // Allow inline scripts for development
                  "style-src 'self' 'unsafe-inline'; " + // Allow inline styles
                  "connect-src 'self' https://example.com; " + // Allow connections to example.com
                  "img-src 'self' data: https:; " + // Allow images from https and data URLs
                  "font-src 'self' data:;", // Allow fonts from data URLs
              ],
            },
          });
        }
      );

      if (viteConfig.appOverlay.devServerUrl) {
        log.debug(
          `Loading overlay from dev URL: ${viteConfig.appOverlay.devServerUrl}`,
          "AppOverlay"
        );
        appOverlay.webContents.loadURL(viteConfig.appOverlay.devServerUrl);
      } else {
        log.debug("Loading overlay from file", "AppOverlay");
        appOverlay.webContents.loadFile(
          path.join(
            __dirname,
            `../renderer/${viteConfig.appOverlay.name}/app-overlay.html`
          )
        );
      }

      // Add event listeners to track overlay webContents events
      appOverlay.webContents.on("blur", () => {
        log.debug("Overlay webContents blur event", "AppOverlay");
      });

      appOverlay.webContents.on("focus", () => {
        log.debug("Overlay webContents focus event", "AppOverlay");
      });

      appOverlay.webContents.on("did-finish-load", () => {
        log.debug("Overlay webContents did-finish-load event", "AppOverlay");
      });

      if (process.env.NODE_ENV === "development") {
        const devTools = new BrowserWindow();
        appOverlay.webContents.setDevToolsWebContents(devTools.webContents);
        appOverlay.webContents.openDevTools({ mode: "detach" });
      }

      this.overlay = appOverlay;
      this.state.overlay = appOverlay;
      log.debug("Overlay view created successfully", "AppOverlay");
    }
  }

  show() {
    log.debug("AppOverlay.show() called", "AppOverlay");
    this.createOverlay();
    if (this.overlay) {
      this.baseWindow.contentView.addChildView(this.overlay);
      log.debug("Overlay added to baseWindow contentView", "AppOverlay");
    }
  }

  hide() {
    log.debug("AppOverlay.hide() called", "AppOverlay");
    if (this.overlay) {
      this.baseWindow.contentView.removeChildView(this.overlay);
      log.debug("Overlay removed from baseWindow contentView", "AppOverlay");
    }
  }

  // Optional: Method to destroy the overlay completely
  destroy() {
    log.debug("AppOverlay.destroy() called", "AppOverlay");
    if (this.overlay) {
      this.hide();
      this.overlay = null;
      this.state.overlay = null;
      log.debug("Overlay destroyed", "AppOverlay");
    }
  }
}
