import { ipcMain, IpcMainEvent, IpcMainInvokeEvent } from "electron";
import { log } from "../utils/mainLogger";

export type IPCHandlerType = "invoke" | "on";

export type IPCInvokeHandler = (
  event: IpcMainInvokeEvent,
  ...args: any[]
) => any;

export type IPCEventHandler = (event: IpcMainEvent, ...args: any[]) => void;

export type IPCHandler =
  | { type: "invoke"; fn: IPCInvokeHandler }
  | { type: "on"; fn: IPCEventHandler };

export type IPCHandlerMap = Record<string, IPCHandler>;

export class IPCRouter {
  private handlers = new Map<string, IPCHandler>();

  register(channel: string, handler: IPCHandler): void {
    if (this.handlers.has(channel)) {
      log.debug(
        `Replacing existing IPC handler for channel ${channel}`,
        "IPCRouter"
      );
    }

    this.handlers.set(channel, handler);

    if (handler.type === "invoke") {
      ipcMain.handle(channel, handler.fn);
    } else {
      ipcMain.on(channel, handler.fn);
    }
  }

  listChannels(): string[] {
    return Array.from(this.handlers.keys());
  }
}
