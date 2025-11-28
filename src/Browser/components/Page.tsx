import React, { useEffect, useCallback, useState } from "react";
import { PageProps } from "../types";
import { BrowserSlot } from "./BrowserSlot";
import { useBrowserViewUpdater } from "../hooks/useBrowserViewUpdater";
import { useBrowserInitialization } from "../hooks/useBrowserInitialization";

const FOOTER_HEIGHT = 28;
const NORMAL_HEIGHT = 800;

export function Page({ blockId, url, heightMode = "normal" }: PageProps) {
  const { handleUrlChange, handleBoundsChange: handleBoundsChangeUpdater } =
    useBrowserViewUpdater(blockId);
  const {
    initStatus,
    retryInitialization,
    getInitAttemptRef,
  } = useBrowserInitialization(blockId);

  // Calculate height based on mode
  const [viewportHeight, setViewportHeight] = useState(window.innerHeight);

  useEffect(() => {
    const handleResize = () => setViewportHeight(window.innerHeight);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const height =
    heightMode === "expanded"
      ? viewportHeight - FOOTER_HEIGHT - 100 // Extra padding for toolbar and margins
      : NORMAL_HEIGHT;

  const handleBoundsChange = useCallback(
    (bounds: { x: number; y: number; width: number; height: number }) => {
      // We must increment the init attempt ref here to trigger the timeout effect in the hook
      const initAttemptRef = getInitAttemptRef();
      if (
        bounds.width > 0 &&
        bounds.height > 0 &&
        (initStatus.state === "idle" || initStatus.state === "initializing")
      ) {
        initAttemptRef.current += 1;
      }
      handleBoundsChangeUpdater(bounds);
    },
    [handleBoundsChangeUpdater, getInitAttemptRef, initStatus]
  );

  useEffect(() => {
    if (url) {
      handleUrlChange(url);
    }
  }, [url, handleUrlChange]);

  // Cleanup when component unmounts
  useEffect(() => {
    return () => {
      console.log(`[Browser] Cleaning up browser for blockId: ${blockId}`);
      window.electronAPI.removeBrowser(blockId);
    };
  }, [blockId]);

  const handleRetry = () => {
    retryInitialization();
    // After resetting state, we need to re-trigger the update flow.
    // The bounds update is a good way to do this.
    // The actual bounds are managed within BrowserSlot, so we can't get them here directly.
    // This is a bit of a hack, but we can send a "dummy" update if needed,
    // though the user resizing the slot would naturally trigger it.
    // For now, we rely on the user or the existing flow to provide new bounds.
  };

  return (
    <div
      key="browserContainer"
      style={{
        width: "100%",
        height,
      }}
    >
      <BrowserSlot
        key={blockId}
        blockId={blockId}
        onBoundsChange={handleBoundsChange}
        initStatus={initStatus}
        onRetry={handleRetry}
      />
    </div>
  );
}
