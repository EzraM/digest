import { useState, useEffect, useRef, useCallback } from "react";
import { BrowserInitStatus } from "../types";
import { buildBrowserInitError } from "../utils/errorMessages";

/**
 * A custom hook to manage the initialization lifecycle of a browser view.
 * It listens for status updates from the main process, handles timeouts,
 * and provides a retry mechanism.
 *
 * @param blockId The ID of the block being initialized.
 * @returns An object with the current initialization state and a retry function.
 */
type BrowserInitializedEvent = {
  blockId: string;
  success: boolean;
  status?: "created" | "loaded" | "existing";
  error?: string;
  errorCode?: number;
  errorDescription?: string;
  url?: string;
};

export const useBrowserInitialization = (blockId: string) => {
  const [initStatus, setInitStatus] = useState<BrowserInitStatus>({
    state: "idle",
  });
  const initAttemptRef = useRef(0);

  // Listen for initialization status updates from the main process
  useEffect(() => {
    console.log(
      `[useBrowserInitialization] Setting up listener for blockId: ${blockId}`
    );
    const unsubscribe = window.electronAPI.onBrowserInitialized(
      (data: BrowserInitializedEvent) => {
        if (data.blockId === blockId) {
          console.log(
            `[useBrowserInitialization] Received status for ${blockId}:`,
            JSON.stringify(data, null, 2)
          );

          if (data.success) {
            if (data.status === "loaded" || !data.status) {
              console.log(
                `[useBrowserInitialization] Setting initialized=true for ${blockId}`
              );
              setInitStatus({ state: "initialized" });
            } else {
              console.log(
                `[useBrowserInitialization] Success but status=${data.status}, setting initializing`
              );
              setInitStatus({
                state: "initializing",
                detail: data.status,
              });
            }
          } else {
            console.log(
              `[useBrowserInitialization] Error received for ${blockId}:`,
              data.error,
              `code=${data.errorCode}, description=${data.errorDescription}`
            );
            const errorDetails = buildBrowserInitError({
              code: data.errorCode,
              description: data.errorDescription,
              url: data.url,
              rawMessage: data.error || null,
            });
            console.log(
              `[useBrowserInitialization] Built error details for ${blockId}:`,
              errorDetails
            );
            setInitStatus({ state: "error", error: errorDetails });
          }
        }
      }
    );

    return () => {
      console.log(
        `[useBrowserInitialization] Cleaning up listener for blockId: ${blockId}`
      );
      unsubscribe();
    };
  }, [blockId]);

  // Handle initialization timeouts
  useEffect(() => {
    if (
      initAttemptRef.current > 0 &&
      (initStatus.state === "idle" || initStatus.state === "initializing")
    ) {
      const initTimeout = setTimeout(() => {
        // Check current state - if still initializing, set error
        // Note: This uses the state from when timeout was set, but since the effect
        // clears/recreates the timeout when state changes, this should be safe
        setInitStatus((current) => {
          if (current.state === "idle" || current.state === "initializing") {
            console.warn(
              `[useBrowserInitialization] Timeout for blockId: ${blockId}`
            );
            return {
              state: "error",
              error: buildBrowserInitError({
                code: -118, // ERR_TIMED_OUT - use a timeout error code for better categorization
                description: "ERR_TIMED_OUT",
                url: "browser-initialization", // Placeholder for initialization timeout
                rawMessage:
                  "The browser view took too long to initialize (10 seconds). This may indicate a network issue or the page is slow to load.",
              }),
            };
          }
          return current; // State already changed, don't override
        });
      }, 10000); // 10-second timeout

      return () => clearTimeout(initTimeout);
    }
  }, [blockId, initStatus.state, initAttemptRef.current]);

  const retryInitialization = useCallback(() => {
    console.log(
      `[useBrowserInitialization] Retrying initialization for blockId: ${blockId}`
    );
    setInitStatus({ state: "idle" });
    initAttemptRef.current = 0; // Resetting allows re-triggering
    // The parent component will be responsible for re-sending the update that triggers initialization.
  }, [blockId]);

  // This ref needs to be exposed so the parent can increment it
  const getInitAttemptRef = () => initAttemptRef;

  return {
    initStatus,
    retryInitialization,
    getInitAttemptRef,
  };
};
