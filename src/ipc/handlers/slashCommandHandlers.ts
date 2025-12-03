import { SlashCommandManager } from "../../services/SlashCommandManager";
import { IPCHandlerMap } from "../IPCRouter";
import { SlashCommandResultsPayload } from "../../types/slashCommand";

export function createSlashCommandHandlers(
  slashCommandManager: SlashCommandManager
): IPCHandlerMap {
  return {
    "slash-command:start": {
      type: "on",
      fn: () => {
        slashCommandManager.startSlashCommand();
      },
    },
    "slash-command:cancel": {
      type: "on",
      fn: () => {
        slashCommandManager.cancelSlashCommand();
      },
    },
    "slash-command:update-results": {
      type: "on",
      fn: (_event, payload: SlashCommandResultsPayload) => {
        slashCommandManager.updateResults(payload);
      },
    },
    "slash-command:overlay-ready": {
      type: "on",
      fn: () => {
        slashCommandManager.handleOverlayReady();
      },
    },
    "block-menu:select": {
      type: "on",
      fn: (_event, blockKey: string) => {
        slashCommandManager.selectBlock(blockKey);
      },
    },
  };
}
