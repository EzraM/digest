import React, { useEffect, useCallback, useState, useRef } from "react";
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
  viewId: explicitViewId,
  onReady,
}: PageProps & {
  layout?: "inline" | "full";
  viewId?: string;
  onReady?: (viewId: string) => void;
}) {
  // Layout-qualified view ID: separates inline from fullscreen views
  const viewId = explicitViewId ?? (layout === "full" ? `${blockId}:full` : blockId);

  console.log(
    `[Page] Render: blockId=${blockId}, layout=${layout}, viewId=${viewId}`
  );

  const { handleUrlChange, handleBoundsChange: handleBoundsChangeUpdater } =
    useBrowserViewUpdater(viewId, blockId, layout);
  const { initStatus, retryInitialization, getInitAttemptRef } =
    useBrowserInitialization(viewId);
  const hasReportedReadyRef = useRef(false);

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

  // Reset ready notification when view changes
  useEffect(() => {
    hasReportedReadyRef.current = false;
  }, [viewId]);

  useEffect(() => {
    if (!onReady) return;
    if (initStatus.state === "initialized" && !hasReportedReadyRef.current) {
      hasReportedReadyRef.current = true;
      onReady(viewId);
    }
  }, [initStatus.state, onReady, viewId]);

  // Send scrollPercent to main process when component mounts or scrollPercent changes
  useEffect(() => {
    if (scrollPercent !== undefined) {
      console.log(
        `[Browser] Setting scroll percent for blockId: ${blockId}, scrollPercent: ${scrollPercent}`
      );
      window.electronAPI.browser.setScrollPercent(blockId, scrollPercent);
    }
  }, [blockId, scrollPercent]);

  // View lifecycle: destroy view immediately on unmount
  useEffect(() => {
    console.log(`[Page] Mount effect: viewId=${viewId}, layout=${layout}`);
    return () => {
      console.log(`[Page] Unmount cleanup: viewId=${viewId}, layout=${layout}`);
      // Destroy view immediately on unmount
      window.electronAPI.removeView(viewId);
    };
  }, [viewId, layout]);

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
