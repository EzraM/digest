import { BaseWindow, WebContentsView, BrowserWindow } from "electron";
import path from "path";
import { log } from "../utils/mainLogger";
import { shouldOpenDevTools } from "../config/development";
import { viteConfig } from "../config/vite";

export interface PromptOverlayState {
  overlay?: WebContentsView;
}

export class PromptOverlay {
  private overlay: WebContentsView | null = null;
  private state: PromptOverlayState = {};

  constructor(
    initialState: PromptOverlayState,
    private baseWindow: BaseWindow,
    private globalAppView?: WebContentsView
  ) {
    this.state = { ...initialState };
  }

  private createOverlay() {
    if (!this.overlay) {
      log.debug("Creating new prompt overlay view", "PromptOverlay");
      const promptOverlay = new WebContentsView({
        webPreferences: {
          preload: path.join(__dirname, `prompt-overlay.preload.js`),
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: false,
          webSecurity: true,
          allowRunningInsecureContent: false,
        },
      });

      // Position at top of screen
      const windowBounds = this.baseWindow.getBounds();
      const overlayWidth = 450;
      const overlayHeight = 120;
      const centerX = Math.floor((windowBounds.width - overlayWidth) / 2);
      const topY = 20; // 20px from top

      promptOverlay.setBounds({
        x: centerX,
        y: topY,
        width: overlayWidth,
        height: overlayHeight,
      });

      promptOverlay.webContents.session.webRequest.onHeadersReceived(
        (details, callback) => {
          callback({
            responseHeaders: {
              ...details.responseHeaders,
              "Content-Security-Policy": [
                "default-src 'self' 'unsafe-inline' data: blob:; " +
                  "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " + // Allow inline scripts and eval for Vite
                  "style-src 'self' 'unsafe-inline' data: blob: https:; " + // Allow external stylesheets for Mantine
                  "connect-src 'self' wss: ws: https:; " + // Allow websockets for HMR and external connections
                  "img-src 'self' data: https: blob:; " + // Allow images from various sources
                  "font-src 'self' data: https: blob:; " + // Allow fonts from various sources including Google Fonts
                  "worker-src 'self' blob:; " + // Allow web workers
                  "child-src 'self';", // Allow child contexts
              ],
            },
          });
        }
      );

      if (viteConfig.promptOverlay.devServerUrl) {
        log.debug(
          `Loading prompt overlay from dev URL: ${viteConfig.promptOverlay.devServerUrl}`,
          "PromptOverlay"
        );
        promptOverlay.webContents.loadURL(
          viteConfig.promptOverlay.devServerUrl
        );
      } else {
        log.debug("Loading prompt overlay from file", "PromptOverlay");
        promptOverlay.webContents.loadFile(
          path.join(
            __dirname,
            `../renderer/${viteConfig.promptOverlay.name}/index.html`
          )
        );
      }

      promptOverlay.webContents.on("did-finish-load", () => {
        log.debug(
          "Prompt overlay webContents did-finish-load event",
          "PromptOverlay"
        );

        // Inject debugging info to distinguish this overlay
        promptOverlay.webContents
          .executeJavaScript(
            `
            console.log('[PromptOverlay Debug] Prompt overlay loaded successfully');
            document.title = 'Digest Prompt Overlay';
          `
          )
          .catch((error) => {
            log.debug(
              `Failed to inject prompt overlay debugging script: ${error}`,
              "PromptOverlay"
            );
          });
      });

      // Log console messages from the prompt overlay
      promptOverlay.webContents.on(
        "console-message",
        (event, level, message, line, sourceId) => {
          log.debug(
            `[PromptOverlay] Console ${level}: ${message} (${sourceId}:${line})`,
            "PromptOverlay"
          );
        }
      );

      // Log resource loading failures
      promptOverlay.webContents.on(
        "did-fail-load",
        (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
          log.debug(
            `[PromptOverlay] Resource failed to load: ${validatedURL} - ${errorDescription} (${errorCode}) [mainFrame: ${isMainFrame}]`,
            "PromptOverlay"
          );
        }
      );

      if (process.env.NODE_ENV === "development") {
        // Open devtools for prompt overlay if configured
        if (shouldOpenDevTools("openPromptOverlay")) {
          const devTools = new BrowserWindow();
          promptOverlay.webContents.setDevToolsWebContents(
            devTools.webContents
          );
          promptOverlay.webContents.openDevTools({ mode: "detach" });
        }
      }

      this.overlay = promptOverlay;
      this.state.overlay = promptOverlay;
      log.debug("Prompt overlay view created successfully", "PromptOverlay");
    }
  }

  show() {
    log.debug("PromptOverlay.show() called", "PromptOverlay");
    this.createOverlay();
    if (this.overlay) {
      this.baseWindow.contentView.addChildView(this.overlay);
      log.debug(
        "Prompt overlay added to baseWindow contentView",
        "PromptOverlay"
      );

      // Ensure prompt overlay is on top by setting it as the active child
      try {
        // Move to front (this ensures it's the top-most overlay)
        this.baseWindow.contentView.removeChildView(this.overlay);
        this.baseWindow.contentView.addChildView(this.overlay);
        log.debug("Prompt overlay moved to front", "PromptOverlay");
      } catch (error) {
        log.debug(
          `Error moving prompt overlay to front: ${error}`,
          "PromptOverlay"
        );
      }
    }
  }

  hide() {
    log.debug("PromptOverlay.hide() called", "PromptOverlay");
    if (this.overlay) {
      this.baseWindow.contentView.removeChildView(this.overlay);
      log.debug(
        "Prompt overlay removed from baseWindow contentView",
        "PromptOverlay"
      );
    }
  }

  destroy() {
    log.debug("PromptOverlay.destroy() called", "PromptOverlay");
    if (this.overlay) {
      this.overlay.webContents.close();
      this.overlay = null;
      this.state.overlay = undefined;
      log.debug("Prompt overlay destroyed", "PromptOverlay");
    }
  }

  isVisible(): boolean {
    return this.overlay !== null;
  }
}
