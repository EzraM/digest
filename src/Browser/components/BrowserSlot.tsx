import React, { useRef, useEffect } from "react";
import { useSize } from "../hooks/useSize";
import { BrowserSlotProps } from "../types";

export function BrowserSlot({
  blockId,
  onBoundsChange,
  isInitialized,
  initError,
  initStatus,
  onRetry,
}: BrowserSlotProps) {
  const ref = useRef<HTMLDivElement>(null);
  const size = useSize(ref);

  // Send size updates when the size changes
  useEffect(() => {
    if (size && onBoundsChange) {
      const { width = 0, height = 0 } = size;
      const x = typeof size.x === "number" ? size.x : 0;
      const y = typeof size.y === "number" ? size.y : 0;

      const update = { x, y, width, height };
      onBoundsChange(update);
    }
  }, [size, onBoundsChange]);

  // Also add an initial size check on mount
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (ref.current && onBoundsChange) {
        const rect = ref.current.getBoundingClientRect();
        const update = {
          x: typeof rect.x === "number" ? rect.x : 0,
          y: typeof rect.y === "number" ? rect.y : 0,
          width: rect.width || 0,
          height: rect.height || 0,
        };
        onBoundsChange(update);
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
      {!isInitialized && (
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            color: "#666",
            textAlign: "center",
          }}
        >
          {initError ? (
            <>
              <div style={{ color: "red", marginBottom: "10px" }}>
                {initError}
              </div>
              <button
                onClick={onRetry}
                style={{
                  padding: "5px 10px",
                  cursor: "pointer",
                }}
              >
                Retry
              </button>
            </>
          ) : (
            <>
              {initStatus === "created" ? (
                <>Loading page...</>
              ) : (
                <>Initializing browser...</>
              )}
              <div style={{ fontSize: "0.8em", marginTop: "5px" }}>
                {initStatus ? `Status: ${initStatus}` : ""}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
