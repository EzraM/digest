import { BrowserWindow, WebContentsView } from "electron";
import path from "path";
import { viteConfig } from "../config/vite";
import { OverlayState } from "../types/window";
import { log } from "../utils/mainLogger";
import { shouldOpenDevTools } from "../config/development";

export class AppOverlay {
  private overlay: WebContentsView | null = null;
  private baseWindow: BrowserWindow;
  private state: OverlayState;
  private globalAppView: any; // WebContentsView reference

  constructor(
    state: OverlayState,
    baseWindow: BrowserWindow,
    globalAppView: any
  ) {
    this.state = state;
    this.baseWindow = baseWindow;
    this.globalAppView = globalAppView;
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

      // Center the HUD overlay on the screen
      const windowBounds = this.baseWindow.getBounds();
      const overlayWidth = 500;
      const overlayHeight = 400;
      const centerX = Math.floor((windowBounds.width - overlayWidth) / 2);
      const centerY = Math.floor((windowBounds.height - overlayHeight) / 2);

      appOverlay.setBounds({
        x: centerX,
        y: centerY,
        width: overlayWidth,
        height: overlayHeight,
      });

      appOverlay.webContents.session.webRequest.onHeadersReceived(
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

      // Add comprehensive event listeners to track overlay webContents events
      appOverlay.webContents.on("blur", () => {
        log.debug("Overlay webContents blur event", "AppOverlay");
      });

      appOverlay.webContents.on("focus", () => {
        log.debug("Overlay webContents focus event", "AppOverlay");
      });

      appOverlay.webContents.on("did-finish-load", () => {
        log.debug("Overlay webContents did-finish-load event", "AppOverlay");

        // Inject CSS debugging script for HUD styling issues
        appOverlay.webContents
          .executeJavaScript(
            `
          console.log('[HUD Debug] DOM ready, checking Mantine styling...');
          
          // Count stylesheets
          const stylesheets = document.querySelectorAll('link[rel="stylesheet"], style');
          console.log(\`[HUD Debug] Found \${stylesheets.length} stylesheets\`);
          
          // Check for failed CSS loads
          document.querySelectorAll('link[rel="stylesheet"]').forEach((link, index) => {
            link.addEventListener('error', () => {
              console.error(\`[HUD Debug] Failed to load stylesheet \${index}: \${link.href}\`);
            });
            link.addEventListener('load', () => {
              console.log(\`[HUD Debug] Successfully loaded stylesheet \${index}: \${link.href}\`);
            });
          });
          
          // Check for Mantine CSS variables
          const rootElement = document.documentElement;
          const computedStyle = window.getComputedStyle(rootElement);
          const mantineColorBlue = computedStyle.getPropertyValue('--mantine-color-blue-6');
          console.log(\`[HUD Debug] Mantine blue color variable: \${mantineColorBlue || 'NOT FOUND'}\`);
          
          // Log body styles
          const bodyStyles = window.getComputedStyle(document.body);
          console.log(\`[HUD Debug] Body background: \${bodyStyles.background || 'none'}\`);
          console.log(\`[HUD Debug] Body font-family: \${bodyStyles.fontFamily || 'inherit'}\`);
        `
          )
          .catch((error) => {
            log.debug(
              `Failed to inject HUD debugging script: ${error}`,
              "AppOverlay"
            );
          });
      });

      // Log console messages from the HUD
      appOverlay.webContents.on(
        "console-message",
        (event, level, message, line, sourceId) => {
          log.debug(
            `[HUD] Console ${level}: ${message} (${sourceId}:${line})`,
            "AppOverlay"
          );
        }
      );

      // Log resource loading failures
      appOverlay.webContents.on(
        "did-fail-load",
        (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
          log.debug(
            `[HUD] Resource failed to load: ${validatedURL} - ${errorDescription} (${errorCode}) [mainFrame: ${isMainFrame}]`,
            "AppOverlay"
          );
        }
      );

      if (process.env.NODE_ENV === "development") {
        // Open devtools for HUD overlay if configured
        if (shouldOpenDevTools("openHudOverlay")) {
          const devTools = new BrowserWindow();
          appOverlay.webContents.setDevToolsWebContents(devTools.webContents);
          appOverlay.webContents.openDevTools({ mode: "detach" });
        }
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

      // Transfer focus to the HUD WebContents so keyboard input goes there
      // Use a small delay to let the BlockNote suggestion menu stabilize
      setTimeout(() => {
        if (this.overlay && !this.overlay.webContents.isDestroyed()) {
          log.debug("Transferring focus to HUD WebContents", "AppOverlay");
          try {
            this.overlay.webContents.focus();
            log.debug("Successfully focused HUD WebContents", "AppOverlay");
          } catch (error) {
            log.debug(
              `Failed to focus HUD WebContents: ${error}`,
              "AppOverlay"
            );
          }
        }
      }, 100); // Brief delay to let suggestion menu stabilize
    }
  }

  hide() {
    log.debug("AppOverlay.hide() called", "AppOverlay");
    if (this.overlay) {
      this.baseWindow.contentView.removeChildView(this.overlay);
      log.debug("Overlay removed from baseWindow contentView", "AppOverlay");

      // Return focus to the app view (where React/BlockNote runs) when HUD is hidden
      try {
        if (
          this.globalAppView &&
          !this.globalAppView.webContents.isDestroyed()
        ) {
          this.globalAppView.webContents.focus();
          log.debug("Returned focus to app view", "AppOverlay");
        } else {
          // Fallback to base window if app view not available
          this.baseWindow.webContents.focus();
          log.debug("Returned focus to base window (fallback)", "AppOverlay");
        }
      } catch (error) {
        log.debug(`Failed to return focus: ${error}`, "AppOverlay");
      }
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
