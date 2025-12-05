import { useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import "./SiteBlockNotification.css";
import { log } from "../../utils/rendererLogger";
import { useSize } from "../hooks/useSize";
import { useBrowserViewUpdater } from "../hooks/useBrowserViewUpdater";

type SiteBlockNotificationProps = {
  blockId: string;
  url: string;
  onAnimationComplete: () => void;
};

/**
 * Notification component that shows a bounce animation
 * when a new page block is created in the background.
 * Renders as a portal overlay at the bottom of the viewport.
 * Includes a preview of the page content in the preview area.
 */
export const SiteBlockNotification = ({
  blockId,
  url,
  onAnimationComplete,
}: SiteBlockNotificationProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const animationCompleteRef = useRef(false);

  // Create a preview browser view with a unique blockId
  const previewBlockId = `${blockId}-preview`;
  const { handleUrlChange, handleBoundsChange } =
    useBrowserViewUpdater(previewBlockId);

  // Set up preview browser view bounds tracking
  useSize(previewRef, handleBoundsChange);

  // Set URL for preview when component mounts
  useEffect(() => {
    log.debug(
      `SiteBlockNotification mounted for blockId: ${blockId}, url: ${url}`,
      "SiteBlockNotification"
    );
    if (url) {
      handleUrlChange(url);
    }
  }, [blockId, url, handleUrlChange]);

  // Clean up preview browser view when notification is removed
  useEffect(() => {
    return () => {
      log.debug(
        `Cleaning up preview browser view for blockId: ${previewBlockId}`,
        "SiteBlockNotification"
      );
      window.electronAPI.removeBrowser(previewBlockId);
    };
  }, [previewBlockId]);

  // Use useLayoutEffect to ensure listener is attached before animation starts
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) {
      log.debug(
        `Container ref not available yet for blockId: ${blockId}`,
        "SiteBlockNotification"
      );
      return;
    }

    log.debug(
      `Setting up animationend listener for blockId: ${blockId}`,
      "SiteBlockNotification"
    );

    // Set up animation end listener
    const handleAnimationEnd = (e: AnimationEvent) => {
      // Only handle the bounce animation, ignore other animations
      if (e.animationName !== "bounceUpFromBottom") {
        return;
      }

      if (!animationCompleteRef.current) {
        animationCompleteRef.current = true;
        log.debug(
          `Animation ended for blockId: ${blockId}, animationName: ${e.animationName}`,
          "SiteBlockNotification"
        );
        onAnimationComplete();
      }
    };

    container.addEventListener("animationend", handleAnimationEnd);

    // Log when animation starts
    const handleAnimationStart = (e: AnimationEvent) => {
      if (e.animationName === "bounceUpFromBottom") {
        log.debug(
          `Animation started for blockId: ${blockId}`,
          "SiteBlockNotification"
        );
      }
    };

    container.addEventListener("animationstart", handleAnimationStart);

    return () => {
      container.removeEventListener("animationend", handleAnimationEnd);
      container.removeEventListener("animationstart", handleAnimationStart);
    };
  }, [blockId, onAnimationComplete]);

  // Find the block group to match its width and position - same as site blocks
  const blockGroup = document.querySelector(".bn-block-group");
  const blockGroupRect = blockGroup?.getBoundingClientRect();
  const blockGroupWidth = blockGroupRect?.width ?? "100%";
  const blockGroupLeft = blockGroupRect?.left ?? null;

  const portalRoot = document.body;

  // Calculate positioning: align with block group if available, otherwise center
  const positionStyle: React.CSSProperties & { "--center-x"?: string } = {
    width:
      typeof blockGroupWidth === "number"
        ? `${blockGroupWidth}px`
        : blockGroupWidth,
  };

  if (blockGroupLeft !== null) {
    // Align with block group
    positionStyle.left = `${blockGroupLeft}px`;
  } else {
    // Fallback: center if block group position not available
    positionStyle.left = "50%";
    // Use CSS variable to tell animation to include translateX(-50%)
    positionStyle["--center-x"] = "-50%";
  }

  return createPortal(
    <div
      ref={containerRef}
      className="site-block-notification"
      style={positionStyle}
    >
      {/* Top bar matching SiteBlock styling */}
      <div
        style={{
          padding: "8px 12px",
          backgroundColor: "#f8f9fa",
          borderBottom: "1px solid #e0e0e0",
          display: "flex",
          alignItems: "center",
          gap: "8px",
          fontSize: "12px",
          color: "#666",
        }}
      >
        <span aria-hidden="true">🌐</span>
        <span style={{ color: "#333" }}>Opened</span>
        <span
          style={{
            flex: 1,
            fontFamily: "monospace",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            color: "#333",
          }}
        >
          {url}
        </span>
      </div>

      {/* Content area - 80px height, matching site block preview */}
      <div
        ref={previewRef}
        style={{
          height: "80px",
          width: "100%",
          backgroundColor: "#fff",
          border: "1px solid #e0e0e0",
          overflow: "hidden",
          position: "relative",
        }}
      >
        {/* Browser view will be positioned here by the main process */}
      </div>
    </div>,
    portalRoot
  );
};
