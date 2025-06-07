import React, { useRef, useState, useEffect } from "react";
import { BrowserSlotProps } from "../types";
import { useSize } from "../hooks/useSize";

export function BrowserSlot({ blockId }: BrowserSlotProps) {
  const ref = useRef<HTMLDivElement>(null);
  const size = useSize(ref);
  const [isInitialized, setIsInitialized] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [initStatus, setInitStatus] = useState<string | null>(null);
  const initAttemptRef = useRef(0);

  // Listen for browser initialization status from main process
  useEffect(() => {
    console.log(
      `[Browser] Setting up initialization listener for blockId: ${blockId}`
    );
    const unsubscribe = window.electronAPI.onBrowserInitialized((data) => {
      if (data.blockId === blockId) {
        console.log(
          `[Browser] Received initialization status for ${blockId}: ${
            data.success
          }${data.status ? ` (${data.status})` : ""}`
        );

        if (data.success) {
          setInitStatus(data.status || "unknown");

          // Only mark as fully initialized if status is 'loaded' or not specified
          if (data.status === "loaded" || !data.status) {
            setIsInitialized(true);
            setInitError(null);
            console.log(
              `[Browser] Browser fully initialized for blockId: ${blockId}`
            );
          } else if (data.status === "created") {
            // For 'created' status, we're waiting for the page to load
            console.log(
              `[Browser] Browser view created for blockId: ${blockId}, waiting for page load`
            );
          }
        } else {
          setInitError(data.error || "Failed to initialize browser");
          console.error(
            `[Browser] Initialization failed for ${blockId}:`,
            data.error
          );
        }
      }
    });

    return () => {
      console.log(
        `[Browser] Cleaning up initialization listener for blockId: ${blockId}`
      );
      unsubscribe();
    };
  }, [blockId]);

  // Send size updates when the size changes
  useEffect(() => {
    console.log("[Browser] Size update:", {
      size,
      blockId,
      hasRef: !!ref.current,
      isInitialized,
      initStatus,
      initAttempt: initAttemptRef.current,
    });

    if (size) {
      // Extract values with fallbacks to prevent undefined values
      const { width = 0, height = 0 } = size;
      // Ensure x and y are numbers, defaulting to 0 if undefined
      const x = typeof size.x === "number" ? size.x : 0;
      const y = typeof size.y === "number" ? size.y : 0;

      const update = {
        x,
        y,
        width,
        height,
        blockId,
      };
      console.log("[Browser] Sending size update:", update);
      window.electronAPI.updateBrowser(update);

      // If dimensions are valid and we haven't marked as initialized yet
      if (width > 0 && height > 0 && !isInitialized && !initStatus) {
        initAttemptRef.current += 1;
        console.log(
          `[Browser] Initialization attempt ${initAttemptRef.current} for blockId: ${blockId}`
        );
      }
    }
  }, [size, blockId, isInitialized, initStatus]);

  // Also add an initial size check on mount with a slight delay to ensure DOM is ready
  useEffect(() => {
    console.log(
      `[Browser] Setting up initial size check for blockId: ${blockId}`
    );
    // Use a small timeout to ensure the DOM has fully rendered
    const timeoutId = setTimeout(() => {
      if (ref.current) {
        const rect = ref.current.getBoundingClientRect();
        console.log("[Browser] Initial size check:", { rect, blockId });

        // Ensure all values are valid numbers
        const update = {
          x: typeof rect.x === "number" ? rect.x : 0,
          y: typeof rect.y === "number" ? rect.y : 0,
          width: rect.width || 0,
          height: rect.height || 0,
          blockId,
        };
        console.log("[Browser] Sending initial size:", update);
        window.electronAPI.updateBrowser(update);
      }
    }, 100); // Small delay to ensure DOM is ready

    return () => {
      console.log(
        `[Browser] Cleaning up initial size check for blockId: ${blockId}`
      );
      clearTimeout(timeoutId);
    };
  }, [blockId]);

  // Add a timeout to detect if initialization is taking too long
  useEffect(() => {
    // Only start timeout if we've sent size updates but haven't received initialization
    if (initAttemptRef.current > 0 && !isInitialized && !initError) {
      console.log(
        `[Browser] Starting initialization timeout for blockId: ${blockId}`
      );
      const initTimeout = setTimeout(() => {
        if (!isInitialized && !initError) {
          console.warn(
            `[Browser] Browser initialization timed out for blockId: ${blockId}`
          );
          setInitError("Initialization timed out. Please try again.");
        }
      }, 10000); // Increase timeout to 10 seconds

      return () => {
        console.log(
          `[Browser] Cleaning up initialization timeout for blockId: ${blockId}`
        );
        clearTimeout(initTimeout);
      };
    }
  }, [blockId, isInitialized, initError, initAttemptRef.current]);

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
                onClick={() => {
                  console.log(
                    `[Browser] Retrying initialization for blockId: ${blockId}`
                  );
                  setInitError(null);
                  setInitStatus(null);
                  initAttemptRef.current = 0;
                  // Trigger a new size update to retry initialization
                  if (ref.current) {
                    const rect = ref.current.getBoundingClientRect();
                    window.electronAPI.updateBrowser({
                      x: typeof rect.x === "number" ? rect.x : 0,
                      y: typeof rect.y === "number" ? rect.y : 0,
                      width: rect.width || 0,
                      height: rect.height || 0,
                      blockId,
                    });
                  }
                }}
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
                {initStatus
                  ? `Status: ${initStatus}`
                  : `Attempt: ${initAttemptRef.current}`}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
} 