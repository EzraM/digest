import { WebContentsView, ipcMain } from "electron";
import { getEventLogger } from "./EventLogger";
import { DigestEvent, EventFilter } from "../types/events";
import { log } from "../utils/mainLogger";

export class DebugEventService {
  private static instance: DebugEventService | null = null;
  private mainRendererWebContents: WebContentsView | null = null;
  private _eventLogger: ReturnType<typeof getEventLogger> | null = null;

  private get eventLogger() {
    if (!this._eventLogger) {
      this._eventLogger = getEventLogger();
    }
    return this._eventLogger;
  }
  private isDebugMode = false;

  constructor() {
    this.setupEventListener();
    this.setupIPCHandlers();
    
    log.debug("DebugEventService initialized", "DebugEventService");
  }

  public static getInstance(): DebugEventService {
    if (!DebugEventService.instance) {
      DebugEventService.instance = new DebugEventService();
    }
    return DebugEventService.instance;
  }

  public setMainRendererWebContents(webContents: WebContentsView): void {
    this.mainRendererWebContents = webContents;
    
    // Send initial data if debug mode is enabled
    if (this.isDebugMode) {
      this.sendInitialData();
    }
  }

  private setupEventListener(): void {
    // Listen to all events from the EventLogger
    this.eventLogger.on('event', (event: DigestEvent) => {
      this.forwardEventToRenderer(event);
    });
  }

  private setupIPCHandlers(): void {
    // Handle debug mode toggle
    ipcMain.handle('debug:toggle', async () => {
      this.isDebugMode = !this.isDebugMode;
      
      if (this.isDebugMode && this.mainRendererWebContents) {
        this.sendInitialData();
      }
      
      // Notify renderer of debug mode change
      if (this.mainRendererWebContents && !this.mainRendererWebContents.webContents.isDestroyed()) {
        this.mainRendererWebContents.webContents.send('debug:mode-changed', this.isDebugMode);
      }
      
      return this.isDebugMode;
    });

    // Handle event history requests
    ipcMain.handle('debug:get-events', async (_, filter: EventFilter) => {
      return this.eventLogger.getEvents(filter);
    });

    // Handle current session events
    ipcMain.handle('debug:get-session-events', async () => {
      return this.eventLogger.getCurrentSessionEvents();
    });

    // Handle debug mode status check
    ipcMain.handle('debug:is-enabled', async () => {
      return this.isDebugMode;
    });

    // Handle clearing event log
    ipcMain.handle('debug:clear-events', async () => {
      // Note: This would require adding a clear method to EventLogger
      // For now, we'll just return success
      return { success: true };
    });
  }

  private sendInitialData(): void {
    if (!this.mainRendererWebContents || this.mainRendererWebContents.webContents.isDestroyed()) {
      return;
    }

    try {
      // Send current session events
      const sessionEvents = this.eventLogger.getCurrentSessionEvents();
      this.mainRendererWebContents.webContents.send('debug:initial-events', sessionEvents);
      
      log.debug(`Sent ${sessionEvents.length} initial events to main renderer`, "DebugEventService");
    } catch (error) {
      log.debug(`Error sending initial data: ${error}`, "DebugEventService");
    }
  }

  private forwardEventToRenderer(event: DigestEvent): void {
    if (!this.mainRendererWebContents || 
        this.mainRendererWebContents.webContents.isDestroyed() || 
        !this.isDebugMode) {
      return;
    }

    try {
      this.mainRendererWebContents.webContents.send('debug:new-event', event);
    } catch (error) {
      log.debug(`Error forwarding event to renderer: ${error}`, "DebugEventService");
    }
  }

  public isEnabled(): boolean {
    return this.isDebugMode;
  }

  public enable(): void {
    if (!this.isDebugMode) {
      this.isDebugMode = true;
      if (this.mainRendererWebContents) {
        this.sendInitialData();
        this.mainRendererWebContents.webContents.send('debug:mode-changed', true);
      }
    }
  }

  public disable(): void {
    if (this.isDebugMode) {
      this.isDebugMode = false;
      if (this.mainRendererWebContents && !this.mainRendererWebContents.webContents.isDestroyed()) {
        this.mainRendererWebContents.webContents.send('debug:mode-changed', false);
      }
    }
  }

  public destroy(): void {
    this.mainRendererWebContents = null;
    DebugEventService.instance = null;
    log.debug("DebugEventService destroyed", "DebugEventService");
  }
}

// Export singleton access function
export function getDebugEventService(): DebugEventService {
  return DebugEventService.getInstance();
}