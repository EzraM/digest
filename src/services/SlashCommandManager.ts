import { AppOverlay } from "./AppOverlay";
import { log } from "../utils/mainLogger";
import { SlashCommandResultsPayload } from "../types/slashCommand";

export enum SlashCommandState {
  INACTIVE = "inactive",
  WAITING_FOR_INPUT = "waiting_for_input",
  HUD_ACTIVE = "hud_active",
  INSERTING_BLOCK = "inserting_block",
}

export class SlashCommandManager {
  private state: SlashCommandState = SlashCommandState.INACTIVE;
  private appOverlay: AppOverlay;
  private globalAppView: any; // WebContentsView reference
  private latestResults: SlashCommandResultsPayload | null = null;

  constructor(appOverlay: AppOverlay, globalAppView: any) {
    this.appOverlay = appOverlay;
    this.globalAppView = globalAppView;
    log.debug("SlashCommandManager initialized", "SlashCommandManager");
  }

  /**
   * Start slash command mode - called when user types "/"
   */
  startSlashCommand(): void {
    if (this.state !== SlashCommandState.INACTIVE) {
      log.debug(
        `Slash command already active (state: ${this.state})`,
        "SlashCommandManager"
      );
      return;
    }

    log.debug("Starting slash command mode", "SlashCommandManager");
    this.state = SlashCommandState.WAITING_FOR_INPUT;

    // Show HUD overlay
    this.appOverlay.show();

    // Transition to HUD active state
    this.state = SlashCommandState.HUD_ACTIVE;
    this.latestResults = null;
    log.debug("Slash command mode active, HUD shown", "SlashCommandManager");
  }

  /**
   * Handle block selection from HUD
   */
  selectBlock(blockKey: string): void {
    if (this.state !== SlashCommandState.HUD_ACTIVE) {
      log.debug(
        `Block selection ignored - wrong state: ${this.state}`,
        "SlashCommandManager"
      );
      return;
    }

    log.debug(`Block selected: ${blockKey}`, "SlashCommandManager");
    this.state = SlashCommandState.INSERTING_BLOCK;

    // Send block insertion to main renderer
    if (this.globalAppView && !this.globalAppView.webContents.isDestroyed()) {
      this.globalAppView.webContents.send(
        "slash-command:insert-block",
        blockKey
      );
    }

    // End slash command mode
    this.endSlashCommand();
  }

  /**
   * Cancel slash command mode - called on Escape or other cancellation
   */
  cancelSlashCommand(): void {
    if (this.state === SlashCommandState.INACTIVE) {
      return;
    }

    log.debug("Cancelling slash command mode", "SlashCommandManager");
    this.endSlashCommand();
  }

  /**
   * End slash command mode and cleanup
   */
  private endSlashCommand(): void {
    log.debug("Ending slash command mode", "SlashCommandManager");

    // Hide HUD
    this.appOverlay.hide();

    // Reset state
    this.state = SlashCommandState.INACTIVE;
    this.latestResults = null;

    log.debug("Slash command mode ended", "SlashCommandManager");
  }

  /**
   * Get current state for debugging
   */
  getState(): SlashCommandState {
    return this.state;
  }

  /**
   * Check if slash command mode is active
   */
  isActive(): boolean {
    return this.state !== SlashCommandState.INACTIVE;
  }

  updateResults(payload: SlashCommandResultsPayload): void {
    this.latestResults = payload;

    if (this.state !== SlashCommandState.HUD_ACTIVE) {
      log.debug(
        `Received slash command results while inactive (state: ${this.state}), stored for later`,
        "SlashCommandManager",
      );
      return;
    }

    log.debug(
      `Forwarding slash command results to HUD (items: ${payload.items.length}, selected: ${payload.selectedIndex})`,
      "SlashCommandManager",
    );
    this.appOverlay.send("slash-command:update-results", payload);
  }

  handleOverlayReady(): void {
    if (this.state === SlashCommandState.HUD_ACTIVE && this.latestResults) {
      log.debug(
        "HUD overlay reported ready - replaying latest results",
        "SlashCommandManager",
      );
      this.appOverlay.send("slash-command:update-results", this.latestResults);
    }
  }
}
