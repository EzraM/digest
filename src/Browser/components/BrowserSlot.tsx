import React, { useRef, useEffect } from "react";
import { useSize } from "../hooks/useSize";
import { BrowserSlotProps } from "../types";

const getVisibleBounds = (rect: DOMRectReadOnly) => {
  const scrollContainer = document.getElementById(
    "renderer-main-scroll-container"
  );
  const viewportRect = scrollContainer?.getBoundingClientRect();

  const viewportTop = viewportRect?.top ?? 0;
  const viewportLeft = viewportRect?.left ?? 0;
  const viewportRight =
    viewportRect?.right ??
    (typeof window !== "undefined" ? window.innerWidth : rect.right);
  const viewportBottom =
    viewportRect?.bottom ??
    (typeof window !== "undefined" ? window.innerHeight : rect.bottom);

  const x = Math.max(rect.left, viewportLeft);
  const y = Math.max(rect.top, viewportTop);
  const width = Math.max(0, Math.min(rect.right, viewportRight) - x);
  const height = Math.max(0, Math.min(rect.bottom, viewportBottom) - y);

  return { x, y, width, height };
};

export function BrowserSlot({
  blockId,
  onBoundsChange,
  initStatus,
  onRetry,
}: BrowserSlotProps) {
  const ref = useRef<HTMLDivElement>(null);
  const size = useSize(ref);

  // Send size updates when the size changes
  useEffect(() => {
    if (size && onBoundsChange) {
      onBoundsChange(getVisibleBounds(size));
    }
  }, [size, onBoundsChange]);

  // Also add an initial size check on mount
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (ref.current && onBoundsChange) {
        const rect = ref.current.getBoundingClientRect();
        onBoundsChange(getVisibleBounds(rect));
      }
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [onBoundsChange]);

  return (
    <div
      ref={ref}
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
              {onRetry && (
                <button
                  onClick={onRetry}
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
              <div style={{ fontSize: "0.85rem", color: "#555" }}>
                {initStatus.state === "initializing" && initStatus.detail
                  ? `Status: ${initStatus.detail}`
                  : "Hang tight, we're getting things ready."}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
