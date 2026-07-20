import { useEffect, useState } from "react";
import { BrowserLoadStatus } from "../types/browser";

/** Tracks the main-frame loading lifecycle emitted by the Electron browser view. */
export const useBrowserLoadState = (viewId: string): BrowserLoadStatus => {
  const [status, setStatus] = useState<BrowserLoadStatus>("loading");

  useEffect(() => {
    let isMounted = true;
    let receivedLifecycleEvent = false;
    setStatus("loading");

    const unsubscribe = window.electronAPI.onBrowserInitialized((event) => {
      if (!isMounted || event.blockId !== viewId) return;
      receivedLifecycleEvent = true;

      setStatus(event.status);
    });

    // A full-page route can attach to an existing view after its final load
    // event has already fired. Seed from WebContents so it cannot remain on
    // the optimistic loading default in that case.
    void window.electronAPI.browser.getPageInfo(viewId).then((pageInfo) => {
      if (isMounted && !receivedLifecycleEvent && pageInfo.success) {
        setStatus(pageInfo.loadStatus);
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [viewId]);

  return status;
};
