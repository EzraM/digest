import React, { useEffect, useCallback, useRef } from "react";
import { PageProps } from "../types";
import { useBrowserViewUpdater } from "../hooks/useBrowserViewUpdater";
import { useBrowserInitialization } from "../hooks/useBrowserInitialization";
import { useSize } from "../hooks/useSize";
import { useScrollContainer } from "../../context/ScrollContainerContext";
import { toFullViewId } from "../../utils/viewId";
import { SiteLoadingState } from "./SiteLoadingState";

const NORMAL_HEIGHT = 800;

export function Page({
  blockId: providedBlockId,
  url,
  layout = "inline",
  viewId: explicitViewId,
}: PageProps & {
  layout?: "inline" | "full";
  viewId?: string;
}) {
  // For ephemeral URL pages (no blockId), generate a synthetic ID based on URL
  const blockId = providedBlockId ?? `ephemeral-${btoa(url).replace(/[^a-zA-Z0-9]/g, '')}`;

  // Layout-qualified view ID: separates inline from fullscreen views
  const viewId =
    explicitViewId ?? (layout === "full" ? toFullViewId(blockId) : blockId);

  console.log(
    `[Page] Render: blockId=${blockId}, layout=${layout}, viewId=${viewId}`
  );

  const {
    handleUrlChange,
    handleBoundsChange: handleBoundsChangeUpdater,
    placementGeneration,
  } =
    useBrowserViewUpdater(
      viewId,
      blockId,
      layout,
      providedBlockId ? "site-block" : "ephemeral-url"
    );
  const { initStatus, retryInitialization, getInitAttemptRef } =
    useBrowserInitialization(viewId);
  const slotRef = useRef<HTMLDivElement>(null);
  const scrollContainer = useScrollContainer();

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

  // View lifecycle: release the placement on unmount. Main decides whether the
  // journey is detached for reuse or destroyed.
  useEffect(() => {
    console.log(`[Page] Mount effect: viewId=${viewId}, layout=${layout}`);
    return () => {
      console.log(`[Page] Unmount cleanup: viewId=${viewId}, layout=${layout}`);
      window.electronAPI.removeView(viewId, placementGeneration);
    };
  }, [viewId, layout, placementGeneration]);

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
        {initStatus.state !== "initialized" &&
          (initStatus.state === "error" ? (
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
              border: "1px solid #ffa8a8",
            }}
          >
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
            <button
              onClick={handleRetry}
              style={{
                padding: "8px 16px",
                cursor: "pointer",
                borderRadius: "20px",
                border: "none",
                backgroundColor: "#315efb",
                color: "#fff",
                fontWeight: 600,
              }}
            >
              Try again
            </button>
          </div>
          ) : (
            <SiteLoadingState url={url} />
          ))}
      </div>
    </div>
  );
}
