import type { BrowserWindow, WebContents, WebContentsView } from "electron";

export type WindowSession = {
  windowId: string;
  browserWindow: BrowserWindow;
  rendererView: WebContentsView;
};

/**
 * Authoritative process-wide mapping from an Electron sender to its Digest
 * window. Renderer-supplied window identities are never used for routing.
 */
export class WindowRegistry {
  private readonly byWindowId = new Map<string, WindowSession>();
  private readonly windowIdByRendererId = new Map<number, string>();

  register(session: WindowSession): void {
    if (this.byWindowId.has(session.windowId)) {
      throw new Error(`Window already registered: ${session.windowId}`);
    }
    const rendererId = session.rendererView.webContents.id;
    if (this.windowIdByRendererId.has(rendererId)) {
      throw new Error(`Renderer already registered: ${rendererId}`);
    }
    this.byWindowId.set(session.windowId, session);
    this.windowIdByRendererId.set(rendererId, session.windowId);
  }

  resolve(sender: Pick<WebContents, "id">): WindowSession | undefined {
    const windowId = this.windowIdByRendererId.get(sender.id);
    return windowId ? this.byWindowId.get(windowId) : undefined;
  }

  get(windowId: string): WindowSession | undefined {
    return this.byWindowId.get(windowId);
  }

  list(): WindowSession[] {
    return Array.from(this.byWindowId.values());
  }

  retire(windowId: string): WindowSession | undefined {
    const session = this.byWindowId.get(windowId);
    if (!session) return undefined;
    this.byWindowId.delete(windowId);
    this.windowIdByRendererId.delete(session.rendererView.webContents.id);
    return session;
  }
}
