import { useState, useEffect, useRef, useCallback } from "react";

/**
 * A custom hook to manage the initialization lifecycle of a browser view.
 * It listens for status updates from the main process, handles timeouts,
 * and provides a retry mechanism.
 *
 * @param blockId The ID of the block being initialized.
 * @returns An object with the current initialization state and a retry function.
 */
export const useBrowserInitialization = (blockId: string) => {
  const [isInitialized, setIsInitialized] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [initStatus, setInitStatus] = useState<string | null>(null);
  const initAttemptRef = useRef(0);

  // Listen for initialization status updates from the main process
  useEffect(() => {
    console.log(
      `[useBrowserInitialization] Setting up listener for blockId: ${blockId}`
    );
    const unsubscribe = window.electronAPI.onBrowserInitialized((data) => {
      if (data.blockId === blockId) {
        console.log(
          `[useBrowserInitialization] Received status for ${blockId}:`,
          data
        );
        setInitStatus(data.status || null);

        if (data.success) {
          if (data.status === "loaded" || !data.status) {
            setIsInitialized(true);
            setInitError(null);
          }
        } else {
          setInitError(data.error || "Failed to initialize browser");
        }
      }
    });

    return () => {
      console.log(
        `[useBrowserInitialization] Cleaning up listener for blockId: ${blockId}`
      );
      unsubscribe();
    };
  }, [blockId]);

  // Handle initialization timeouts
  useEffect(() => {
    if (initAttemptRef.current > 0 && !isInitialized && !initError) {
      const initTimeout = setTimeout(() => {
        if (!isInitialized && !initError) {
          console.warn(
            `[useBrowserInitialization] Timeout for blockId: ${blockId}`
          );
          setInitError("Initialization timed out. Please try again.");
        }
      }, 10000); // 10-second timeout

      return () => clearTimeout(initTimeout);
    }
  }, [blockId, isInitialized, initError, initAttemptRef.current]);

  const retryInitialization = useCallback(() => {
    console.log(
      `[useBrowserInitialization] Retrying initialization for blockId: ${blockId}`
    );
    setIsInitialized(false);
    setInitError(null);
    setInitStatus(null);
    initAttemptRef.current = 0; // Resetting allows re-triggering
    // The parent component will be responsible for re-sending the update that triggers initialization.
  }, [blockId]);

  // This ref needs to be exposed so the parent can increment it
  const getInitAttemptRef = () => initAttemptRef;

  return {
    isInitialized,
    initError,
    initStatus,
    retryInitialization,
    getInitAttemptRef,
  };
};
