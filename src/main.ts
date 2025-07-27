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
import { LinkInterceptionService } from "./services/LinkInterceptionService";
import { log } from "./utils/mainLogger";
import { shouldOpenDevTools } from "./config/development";
import {
  IntelligentUrlService,
  ProcessingResult,
  DocumentContext,
} from "./services/IntelligentUrlService";
import { BlockCreationService } from "./services/BlockCreationService";
import { BlockCreationRequest } from "./services/ResponseExploder";
import { PromptOverlay } from "./services/PromptOverlay";
import { ViewLayerManager, ViewLayer } from "./services/ViewLayerManager";
import { BlockOperationService } from "./services/BlockOperationService";
import { welcomeContent } from "./content/welcomeContent";

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
let globalPromptOverlay: PromptOverlay | null = null;
let globalViewLayerManager: ViewLayerManager | null = null;
let globalDocumentContext: any = null; // Store current document context for LLM prompts

// Initialize intelligent URL service
const intelligentUrlService = IntelligentUrlService.getInstance();

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

  // Create the view layer manager for proper z-ordering
  const viewLayerManager = new ViewLayerManager(baseWindow);
  globalViewLayerManager = viewLayerManager;

  // Register the main app view with the layer manager
  viewLayerManager.addView("main-app", appViewInstance, ViewLayer.BACKGROUND);

  // Set up link interception for the main renderer process
  const linkInterceptionService = new LinkInterceptionService(appViewInstance);

  const viewManager = new ViewManager(baseWindow, viewLayerManager);
  const appOverlay = new AppOverlay({}, baseWindow, globalAppView);
  const slashCommandManager = new SlashCommandManager(
    appOverlay,
    globalAppView
  );

  // Create and show the prompt overlay (always visible)
  const promptOverlay = new PromptOverlay(
    {},
    baseWindow,
    globalAppView,
    viewLayerManager
  );
  promptOverlay.show();
  globalPromptOverlay = promptOverlay;

  // Connect prompt overlay to intelligent URL service for cost tracking
  intelligentUrlService.setPromptOverlayWebContents(
    promptOverlay.getWebContentsView()
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

  // Set up the link click callback for LinkInterceptionService
  linkInterceptionService.setLinkClickCallback((url: string) => {
    log.debug(
      `Main renderer link click callback called with URL: ${url}`,
      "main"
    );

    // Forward the new block event to the main renderer
    if (globalAppView && !globalAppView.webContents.isDestroyed()) {
      log.debug(
        `Forwarding new block event from main renderer to appView: ${url}`,
        "main"
      );
      globalAppView.webContents.send(EVENTS.BROWSER.NEW_BLOCK, { url });
    } else {
      log.debug(
        "Cannot forward new block event from main renderer - appView not available",
        "main"
      );
    }
  });

  // Store global references
  mainWindow = baseWindow;
  globalViewManager = viewManager;

  // Set up console log forwarding from renderer
  setupConsoleLogForwarding(appViewInstance);

  // Initialize block operation service for unified persistence
  const blockOperationService = BlockOperationService.getInstance();
  blockOperationService.setRendererWebContents(appViewInstance);

  // Document loading/seeding will happen when renderer signals it's ready
  // This prevents race condition where Y.js updates are broadcast before renderer can receive them

  // Set up IPC handlers (including renderer-ready handler)
  setupIpcHandlers(viewManager, slashCommandManager, blockOperationService);

  baseWindow.on("closed", () => {
    mainWindow = null;
    globalViewManager = null;
    globalAppView = null;
    globalPromptOverlay = null;
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
  slashCommandManager: SlashCommandManager,
  blockOperationService: BlockOperationService
) => {
  // Handle renderer ready signal - load/seed document only after renderer is ready
  ipcMain.on("renderer-ready", async () => {
    log.debug("Renderer ready signal received - loading document", "main");

    try {
      const blocks = await blockOperationService.loadDocument();
      log.debug(`Loaded ${blocks.length} blocks from persistence`, "main");

      // If no blocks exist, seed with welcome content
      if (blocks.length === 0) {
        log.debug("No blocks found, seeding with welcome content", "main");
        await blockOperationService.seedInitialContent(welcomeContent);
        log.debug(
          "Welcome content seeded - Y.js will sync to renderer",
          "main"
        );
      } else {
        log.debug("Document loaded - Y.js will sync to renderer", "main");
      }
    } catch (error) {
      log.debug(`Error loading document: ${error}`, "main");
    }
  });

  // Handle browser updates
  ipcMain.on("update-browser", (_, browserLayout) => {
    log.debug(`Received update-browser event`, "main");
    // Migrate to unified event: you must provide both url and bounds here
    // Example: viewManager.handleBlockViewUpdate({ blockId, url, bounds })
    // If browserLayout does not have url, you need to refactor the caller to provide it
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
        // Use the globally stored document context if available, otherwise use passed context
        const documentContext = globalDocumentContext || context;
        log.debug(
          `Using document context: ${
            documentContext ? `${documentContext.blockCount} blocks` : "none"
          }`,
          "main"
        );

        const result = await intelligentUrlService.processInput(
          input,
          documentContext
        );
        log.debug(
          `IPC: Intelligent URL result: ${JSON.stringify(result)}`,
          "main"
        );
        return result;
      } catch (error) {
        log.debug(`IPC: Error processing intelligent URL: ${error}`, "main");
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }
  );

  // Check if intelligent processing is available
  ipcMain.handle("intelligent-url-available", async (): Promise<boolean> => {
    return intelligentUrlService.isAvailable();
  });

  // Get current cost summary
  ipcMain.handle(
    "intelligent-url-cost-summary",
    async (): Promise<{ queryCost: number; sessionTotal: number }> => {
      return intelligentUrlService.getCostSummary();
    }
  );

  // Handle prompt submission from the prompt overlay
  ipcMain.handle(
    "prompt-overlay:submit",
    async (
      event: IpcMainInvokeEvent,
      input: string
    ): Promise<ProcessingResult> => {
      try {
        log.debug(`IPC: Processing prompt overlay input: "${input}"`, "main");
        log.debug(
          `Using document context: ${
            globalDocumentContext
              ? `${globalDocumentContext.blockCount} blocks`
              : "none"
          }`,
          "main"
        );

        const result = await intelligentUrlService.processInput(
          input,
          globalDocumentContext
        );
        log.debug(
          `IPC: Prompt overlay result: ${JSON.stringify(result)}`,
          "main"
        );

        // If successful, forward the XML response to the main renderer to create blocks
        if (
          result.success &&
          result.xmlResponse &&
          globalAppView &&
          !globalAppView.webContents.isDestroyed()
        ) {
          log.debug(
            "Forwarding XML response to main renderer for block creation",
            "main"
          );
          globalAppView.webContents.send("prompt-overlay:create-blocks", {
            xmlResponse: result.xmlResponse,
            originalInput: input,
          });
        }

        return result;
      } catch (error) {
        log.debug(
          `IPC: Error processing prompt overlay input: ${error}`,
          "main"
        );
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }
  );

  // Handle document state updates (continuous sync) with initial state persistence
  ipcMain.on(
    "document-state:update",
    async (event: IpcMainEvent, documentState: any) => {
      if (documentState) {
        const previousBlockCount = globalDocumentContext?.blockCount || 0;
        globalDocumentContext = documentState;

        log.debug(
          `Document state updated: ${
            documentState.blockCount
          } blocks at ${new Date(
            documentState.timestamp
          ).toLocaleTimeString()}`,
          "main"
        );
      }
    }
  );

  // Handle focus prompt overlay request
  ipcMain.on("prompt-overlay:focus", (event: IpcMainEvent) => {
    log.debug("IPC: Focus prompt overlay request received", "main");
    log.debug(
      `Current document context: ${
        globalDocumentContext
          ? `${globalDocumentContext.blockCount} blocks`
          : "none"
      }`,
      "main"
    );

    if (globalPromptOverlay && globalPromptOverlay.isVisible()) {
      globalPromptOverlay.focus();
    }
  });

  // Handle prompt overlay bounds update
  ipcMain.on("prompt-overlay:update-bounds", (event: IpcMainEvent, bounds: { x: number; y: number; width: number; height: number }) => {
    log.debug(`IPC: Prompt overlay bounds update received: ${JSON.stringify(bounds)}`, "main");
    
    if (globalPromptOverlay) {
      globalPromptOverlay.updateBounds(bounds);
    }
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
          input
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

  // Handle block operations for unified processing with transaction metadata
  ipcMain.handle(
    "block-operations:apply",
    async (
      event: IpcMainInvokeEvent,
      operations: any[],
      origin?: any
    ): Promise<any> => {
      try {
        log.debug(
          `IPC: Applying ${operations.length} block operations ${
            origin?.batchId ? `(batch: ${origin.batchId})` : ""
          }`,
          "main"
        );

        // Get the BlockOperationService instance
        const blockOperationService = (
          await import("./services/BlockOperationService")
        ).BlockOperationService.getInstance();

        // Set renderer web contents for updates
        if (globalAppView) {
          blockOperationService.setRendererWebContents(globalAppView);
        }

        // Apply operations with transaction metadata
        const result = await blockOperationService.applyOperations(
          operations,
          origin
        );

        log.debug(
          `IPC: Block operations result: ${
            result.operationsApplied
          } applied, success: ${result.success}${
            result.batchId ? `, batch: ${result.batchId}` : ""
          }`,
          "main"
        );

        return result;
      } catch (error) {
        log.debug(`IPC: Error applying block operations: ${error}`, "main");
        return {
          success: false,
          operationsApplied: 0,
          errors: [error instanceof Error ? error.message : "Unknown error"],
        };
      }
    }
  );

  // Unified handler for update-block-view
  ipcMain.on("update-browser-view", (_, data) => {
    log.debug(
      `Received update-browser-view event for block ${data.blockId}`,
      "main"
    );
    viewManager.handleBlockViewUpdate(data);
  });
};

// Create a new browser block for testing
const testNewBrowserBlock = (url = "https://example.com") => {
  log.debug("Creating test browser block", "main");

  if (globalAppView && !globalAppView.webContents.isDestroyed()) {
    globalAppView.webContents.send(EVENTS.BROWSER.NEW_BLOCK, { url });
  }
};

app.on("ready", () => {
  log.debug("App ready, creating window and setting up services", "main");
  createWindow();
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Clean up global shortcuts when quitting
app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});
