import type {
  OnCompletedListenerDetails,
  Session,
  WebContents,
} from "electron";

export type HttpResponseObserver = (
  details: OnCompletedListenerDetails
) => void;

export interface HttpResponseMonitor {
  observe(
    webContents: WebContents,
    observer: HttpResponseObserver
  ): () => void;
}

type SessionObservers = {
  observers: Map<number, Set<HttpResponseObserver>>;
};

/**
 * Multiplexes Electron's single session.webRequest.onCompleted listener across
 * every browser view sharing that session.
 */
export class SessionHttpResponseMonitor implements HttpResponseMonitor {
  private sessions = new Map<Session, SessionObservers>();

  observe(
    webContents: WebContents,
    observer: HttpResponseObserver
  ): () => void {
    const { session, id: webContentsId } = webContents;
    let entry = this.sessions.get(session);
    if (!entry) {
      entry = { observers: new Map() };
      this.sessions.set(session, entry);
      session.webRequest.onCompleted((details) => {
        const targetId = details.webContentsId ?? details.webContents?.id;
        if (targetId === undefined) return;
        for (const callback of entry?.observers.get(targetId) ?? []) {
          callback(details);
        }
      });
    }

    const callbacks =
      entry.observers.get(webContentsId) ?? new Set<HttpResponseObserver>();
    callbacks.add(observer);
    entry.observers.set(webContentsId, callbacks);

    return () => {
      callbacks.delete(observer);
      if (callbacks.size === 0) {
        entry?.observers.delete(webContentsId);
      }
      if (entry?.observers.size === 0) {
        session.webRequest.onCompleted(null);
        this.sessions.delete(session);
      }
    };
  }
}

export const httpResponseMonitor = new SessionHttpResponseMonitor();
