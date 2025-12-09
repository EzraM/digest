import React, { useEffect, useCallback, useState } from "react";
import { PageProps } from "../types";
import { BrowserSlot } from "./BrowserSlot";
import { useBrowserViewUpdater } from "../hooks/useBrowserViewUpdater";
import { useBrowserInitialization } from "../hooks/useBrowserInitialization";

const NORMAL_HEIGHT = 800;

export function Page({
  blockId,
  url,
  layout = "inline",
  scrollPercent,
}: PageProps & { layout?: "inline" | "full" }) {
  const { handleUrlChange, handleBoundsChange: handleBoundsChangeUpdater } =
    useBrowserViewUpdater(blockId, layout);
  const { initStatus, retryInitialization, getInitAttemptRef } =
    useBrowserInitialization(blockId);

  // Calculate height based on mode
  const [viewportHeight, setViewportHeight] = useState(window.innerHeight);

  useEffect(() => {
    const handleResize = () => setViewportHeight(window.innerHeight);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // For "full" layout, use 100% to fill the grid container (no scrolling on parent)
  // For "inline" layout, use a fixed height
  const height = layout === "full" ? "100%" : NORMAL_HEIGHT;

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

  // Send scrollPercent to main process when component mounts or scrollPercent changes
  useEffect(() => {
    if (scrollPercent !== undefined) {
      console.log(
        `[Browser] Setting scroll percent for blockId: ${blockId}, scrollPercent: ${scrollPercent}`
      );
      window.electronAPI.browser.setScrollPercent(blockId, scrollPercent);
    }
  }, [blockId, scrollPercent]);

  // Acquire/release pattern for view lifecycle management
  useEffect(() => {
    // Acquire on mount
    window.electronAPI.acquireView(blockId);

    return () => {
      // Release on unmount (does NOT destroy immediately)
      // The view will be garbage collected after a delay if not reacquired
      window.electronAPI.releaseView(blockId);
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
