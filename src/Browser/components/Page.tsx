import React, { useEffect, useCallback, useState, useRef } from "react";
import { PageProps } from "../types";
import { useBrowserViewUpdater } from "../hooks/useBrowserViewUpdater";
import { useBrowserInitialization } from "../hooks/useBrowserInitialization";
import { useSize } from "../hooks/useSize";
import { useScrollContainer } from "../../context/ScrollContainerContext";
import { toFullViewId } from "../../utils/viewId";

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
  const viewId =
    explicitViewId ?? (layout === "full" ? toFullViewId(blockId) : blockId);

  console.log(
    `[Page] Render: blockId=${blockId}, layout=${layout}, viewId=${viewId}`
  );

  const { handleUrlChange, handleBoundsChange: handleBoundsChangeUpdater } =
    useBrowserViewUpdater(viewId, blockId, layout);
  const { initStatus, retryInitialization, getInitAttemptRef } =
    useBrowserInitialization(viewId);
  const hasReportedReadyRef = useRef(false);
  const slotRef = useRef<HTMLDivElement>(null);
  const scrollContainer = useScrollContainer();

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
    // The actual bounds are managed via useSize hook, so the user resizing
    // the slot would naturally trigger it. For now, we rely on the user
    // or the existing flow to provide new bounds.
  };

  // Track size changes of the slot
  useSize(slotRef, handleBoundsChange, scrollContainer);

  return (
    <div
      key="browserContainer"
      style={{
        width: "100%",
        height,
      }}
    >
      <div
        ref={slotRef}
        key={blockId}
        style={{
          background: "#eee",
          width: "100%",
          height: "100%",
          position: "relative",
        }}
      >
        {initStatus.state !== "initialized" && (
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              color: "#333",
              textAlign: "center",
              maxWidth: "360px",
              padding: "16px",
              backgroundColor: "rgba(255, 255, 255, 0.95)",
              borderRadius: "12px",
              boxShadow: "0 8px 24px rgba(0, 0, 0, 0.12)",
              border:
                initStatus.state === "error"
                  ? "1px solid #ffa8a8"
                  : "1px solid #e0e0e0",
            }}
          >
            {initStatus.state === "error" ? (
              <>
                <div
                  style={{
                    fontWeight: 600,
                    fontSize: "1rem",
                    marginBottom: "8px",
                  }}
                >
                  {initStatus.error.friendlyTitle}
                </div>
                {initStatus.error.friendlySubtitle && (
                  <div
                    style={{
                      fontSize: "0.9rem",
                      color: "#555",
                      marginBottom: initStatus.error.technicalMessage
                        ? "12px"
                        : "16px",
                    }}
                  >
                    {initStatus.error.friendlySubtitle}
                  </div>
                )}
                {initStatus.error.technicalMessage && (
                  <details
                    style={{
                      textAlign: "left",
                      fontSize: "0.8rem",
                      marginBottom: "12px",
                      backgroundColor: "#f8f9fa",
                      borderRadius: "8px",
                      padding: "8px 12px",
                      border: "1px solid #dee2e6",
                    }}
                  >
                    <summary style={{ cursor: "pointer", fontWeight: 500 }}>
                      Technical details
                    </summary>
                    <pre
                      style={{
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                        margin: "8px 0 0",
                        fontFamily: "monospace",
                      }}
                    >
                      {initStatus.error.technicalMessage}
                    </pre>
                  </details>
                )}
                {handleRetry && (
                  <button
                    onClick={handleRetry}
                    style={{
                      padding: "8px 16px",
                      cursor: "pointer",
                      borderRadius: "20px",
                      border: "none",
                      backgroundColor: "#1c7ed6",
                      color: "#fff",
                      fontWeight: 600,
                    }}
                  >
                    Try again
                  </button>
                )}
              </>
            ) : (
              <>
                <div style={{ fontWeight: 600, marginBottom: "6px" }}>
                  {initStatus.state === "initializing" &&
                  initStatus.detail === "created"
                    ? "Loading page…"
                    : "Initializing browser…"}
                </div>
                <div
                  style={{
                    fontSize: "0.85rem",
                    color: "#555",
                    marginBottom: "16px",
                  }}
                >
                  {initStatus.state === "initializing" && initStatus.detail
                    ? `Status: ${initStatus.detail}`
                    : "Hang tight, we're getting things ready."}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
