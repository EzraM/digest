import {
  app,
  BrowserWindow,
  WebContentsView,
  ipcMain,
  globalShortcut,
  IpcMainEvent,
  IpcMainInvokeEvent,
} from "electron";
import path from "path";
import { ViewManager } from "./services/ViewManager";
import { viteConfig } from "./config/vite";
import { AppOverlay } from "./services/AppOverlay";
import { SlashCommandManager } from "./services/SlashCommandManager";
import { log } from "./utils/mainLogger";
import { shouldOpenDevTools } from "./config/development";
import {
  IntelligentUrlService,
  ProcessingResult,
  DocumentContext,
} from "./services/IntelligentUrlService";
import { BlockCreationService } from "./services/BlockCreationService";
import { BlockCreationRequest } from "./services/ResponseExploder";

if (require("electron-squirrel-startup")) {
  app.quit();
}

const EVENTS = {
  BLOCK_MENU: {
    OPEN: "block-menu:open",
    CLOSE: "block-menu:close",
    SELECT: "block-menu:select",
  },
  BROWSER: {
    INITIALIZED: "browser:initialized",
    NEW_BLOCK: "browser:new-block",
  },
} as const;

// Global reference to keep the window from being garbage collected
let mainWindow: BrowserWindow | null = null;
let globalViewManager: ViewManager | null = null;
let globalAppView: WebContentsView | null = null;

// Initialize intelligent URL service
const intelligentUrlService = new IntelligentUrlService();

// Initialize block creation service
const blockCreationService = new BlockCreationService();

const createWindow = () => {
  const baseWindow = new BrowserWindow({
    width: 1400,
    height: 900,
  });

  const appViewInstance = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, `preload.js`),
      // Security best practices for Electron
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false, // Need to disable sandbox to use contextBridge
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });
  appViewInstance.setBounds({ x: 0, y: 0, height: 900, width: 1400 });

  // Set Content-Security-Policy
  appViewInstance.webContents.session.webRequest.onHeadersReceived(
    (details: any, callback: any) => {
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

  baseWindow.contentView.addChildView(appViewInstance);

  if (viteConfig.mainWindow.devServerUrl) {
    appViewInstance.webContents.loadURL(viteConfig.mainWindow.devServerUrl);
  } else {
    appViewInstance.webContents.loadFile(
      path.join(
        __dirname,
        `../renderer/${viteConfig.mainWindow.name}/index.html`
      )
    );
  }

  // Open devtools for main window if configured
  if (shouldOpenDevTools("openMainWindow")) {
    const devTools = new BrowserWindow();
    appViewInstance.webContents.setDevToolsWebContents(devTools.webContents);
    appViewInstance.webContents.openDevTools({ mode: "detach" });
  }

  // Store global references
  globalAppView = appViewInstance;

  const viewManager = new ViewManager(baseWindow);
  const appOverlay = new AppOverlay({}, baseWindow, globalAppView);
  const slashCommandManager = new SlashCommandManager(
    appOverlay,
    globalAppView
  );

  // Set up the link click callback for ViewManager to properly target the correct WebContents
  viewManager.setLinkClickCallback((url: string) => {
    log.debug(`Link click callback called with URL: ${url}`, "main");

    // Forward the new block event to the main renderer (appView, not mainWindow)
    if (globalAppView && !globalAppView.webContents.isDestroyed()) {
      log.debug(`Forwarding new block event to appView: ${url}`, "main");
      globalAppView.webContents.send(EVENTS.BROWSER.NEW_BLOCK, { url });
    } else {
      log.debug(
        "Cannot forward new block event - appView not available",
        "main"
      );
    }
  });

  // Store global references
  mainWindow = baseWindow;
  globalViewManager = viewManager;

  // Set up console log forwarding from renderer
  setupConsoleLogForwarding(appViewInstance);

  // Set up IPC handlers
  setupIpcHandlers(viewManager, slashCommandManager);

  baseWindow.on("closed", () => {
    mainWindow = null;
    globalViewManager = null;
    globalAppView = null;
  });
};

const setupConsoleLogForwarding = (webContentsView: WebContentsView) => {
  // Forward renderer console logs to main process
  webContentsView.webContents.on(
    "console-message",
    (
      event: any,
      level: number,
      message: string,
      line: number,
      sourceId: string
    ) => {
      const logLevel =
        level === 1
          ? "info"
          : level === 2
          ? "warn"
          : level === 3
          ? "error"
          : "debug";
      const source = sourceId ? path.basename(sourceId) : "renderer";

      log.debug(
        `[RENDERER-${logLevel.toUpperCase()}] ${source}:${line} - ${message}`,
        "renderer-console"
      );
    }
  );

  // Also capture renderer errors
  webContentsView.webContents.on(
    "render-process-gone",
    (event: any, details: any) => {
      log.debug(
        `Renderer process gone. Reason: ${details.reason}, Exit code: ${details.exitCode}`,
        "renderer-crash"
      );
    }
  );

  webContentsView.webContents.on("unresponsive", () => {
    log.debug("Renderer process became unresponsive", "renderer-unresponsive");
  });

  webContentsView.webContents.on("responsive", () => {
    log.debug(
      "Renderer process became responsive again",
      "renderer-responsive"
    );
  });
};

const setupIpcHandlers = (
  viewManager: ViewManager,
  slashCommandManager: SlashCommandManager
) => {
  // Handle URL setting
  ipcMain.on("set-url", (_, url) => {
    log.debug(`Received set-url event with URL: ${url}`, "main");
  });

  // Handle browser updates
  ipcMain.on("update-browser", (_, browserLayout) => {
    log.debug(`Received update-browser event`, "main");
    viewManager.handleLayoutUpdate(browserLayout);
  });

  // Handle browser URL updates
  ipcMain.on("update-browser-url", (_, data) => {
    log.debug(
      `Received update-browser-url event for block ${data.blockId}`,
      "main"
    );
    viewManager.handleUrlUpdate(data);
  });

  // Handle browser removal
  ipcMain.on("remove-browser", (_, blockId) => {
    log.debug(`Received remove-browser event for block ${blockId}`, "main");
    viewManager.handleRemoveView(blockId);
  });

  // Handle slash command events through the new state manager
  ipcMain.on("slash-command:start", () => {
    log.debug("Slash command start event received", "main");
    slashCommandManager.startSlashCommand();
  });

  ipcMain.on("slash-command:cancel", () => {
    log.debug("Slash command cancel event received", "main");
    slashCommandManager.cancelSlashCommand();
  });

  // Handle block selection from HUD through the state manager
  ipcMain.on("block-menu:select", (_, blockKey) => {
    log.debug(`Block selected from HUD: ${blockKey}`, "main");
    slashCommandManager.selectBlock(blockKey);
  });

  // Handle renderer log forwarding
  ipcMain.on(
    "renderer-log",
    (
      event: IpcMainEvent,
      logData: {
        level: string;
        message: string;
        timestamp: string;
        source: string;
      }
    ) => {
      const { level, message, timestamp, source } = logData;
      const safeLevel = (level || "debug").toUpperCase();
      const safeMessage = message || "No message";
      const safeSource = source || "unknown";

      log.debug(
        `[RENDERER-${safeLevel}] ${safeSource} - ${safeMessage}`,
        "renderer-console"
      );
    }
  );

  // Intelligent URL processing
  ipcMain.handle(
    "intelligent-url-process",
    async (
      event: IpcMainInvokeEvent,
      input: string,
      context?: DocumentContext
    ): Promise<ProcessingResult> => {
      try {
        log.debug(`IPC: Processing intelligent URL input: "${input}"`, "main");
        const result = await intelligentUrlService.processInput(input, context);
        log.debug(
          `IPC: Intelligent URL result: ${JSON.stringify(result)}`,
          "main"
        );
        return result;
      } catch (error) {
        log.debug(`IPC: Error processing intelligent URL: ${error}`, "main");
        return {
          classification: "invalid",
          confidence: 1.0,
          action: "error",
          data: {
            error: error instanceof Error ? error.message : "Unknown error",
          },
        };
      }
    }
  );

  // Check if intelligent processing is available
  ipcMain.handle("intelligent-url-available", async (): Promise<boolean> => {
    return intelligentUrlService.isAvailable();
  });

  // Process input and create blocks
  ipcMain.handle(
    "process-input-create-blocks",
    async (
      event: IpcMainInvokeEvent,
      input: string,
      context?: any
    ): Promise<{
      success: boolean;
      blocks?: BlockCreationRequest[];
      error?: string;
      metadata?: any;
    }> => {
      try {
        log.debug(
          `IPC: Processing input for block creation: "${input}"`,
          "main"
        );
        const result = await blockCreationService.processInputAndCreateBlocks(
          input,
          context
        );
        log.debug(
          `IPC: Block creation result: ${JSON.stringify(result)}`,
          "main"
        );
        return result;
      } catch (error) {
        log.debug(`IPC: Error in block creation: ${error}`, "main");
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
          metadata: {
            originalInput: input,
          },
        };
      }
    }
  );

  // Check if intelligent block creation is available
  ipcMain.handle("block-creation-available", async (): Promise<boolean> => {
    return blockCreationService.isIntelligentProcessingAvailable();
  });
};

// Create a new browser block for testing
const testNewBrowserBlock = (url = "https://example.com") => {
  log.debug("Creating test browser block", "main");

  if (globalAppView && !globalAppView.webContents.isDestroyed()) {
    globalAppView.webContents.send(EVENTS.BROWSER.NEW_BLOCK, { url });
  }
};

// Register the global shortcut when the app is ready
app.whenReady().then(() => {
  createWindow();

  // Register a Cmd+Shift+N shortcut for testing new browser block creation
  globalShortcut.register("CommandOrControl+Shift+N", () => {
    log.debug("Shortcut triggered for new browser block", "main");
    testNewBrowserBlock();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Clean up global shortcuts when quitting
app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});
