import { BrowserWindow, WebContentsView } from "electron";
import path from "path";
import { viteConfig } from "../config/vite";
import { OverlayState } from "../types/window";

export class AppOverlay {
  private overlay: WebContentsView | null = null;
  private baseWindow: BrowserWindow;
  private state: OverlayState;

  constructor(state: OverlayState, baseWindow: BrowserWindow) {
    this.state = state;
    this.baseWindow = baseWindow;
  }

  private createOverlay() {
    if (!this.overlay) {
      const appOverlay = new WebContentsView({
        webPreferences: {
          preload: path.join(__dirname, `app-overlay.preload.js`),
          nodeIntegration: true,
        },
      });

      appOverlay.setBounds({ x: 1000, y: 200, height: 600, width: 400 });

      if (viteConfig.appOverlay.devServerUrl) {
        appOverlay.webContents.loadURL(viteConfig.appOverlay.devServerUrl);
      } else {
        appOverlay.webContents.loadFile(
          path.join(
            __dirname,
            `../renderer/${viteConfig.appOverlay.name}/app-overlay.html`
          )
        );
      }

      const devTools = new BrowserWindow();
      appOverlay.webContents.setDevToolsWebContents(devTools.webContents);
      appOverlay.webContents.openDevTools({ mode: "detach" });

      this.overlay = appOverlay;
      this.state.overlay = appOverlay;
    }
  }

  show() {
    this.createOverlay();
    if (this.overlay) {
      this.baseWindow.contentView.addChildView(this.overlay);
    }
  }

  hide() {
    if (this.overlay) {
      this.baseWindow.contentView.removeChildView(this.overlay);
    }
  }

  // Optional: Method to destroy the overlay completely
  destroy() {
    if (this.overlay) {
      this.hide();
      this.overlay = null;
      this.state.overlay = null;
    }
  }
}
