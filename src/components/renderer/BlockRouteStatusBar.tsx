import React from "react";
import { ClipDraftsButton } from "../clip/ClipDraftsButton";

type BlockRouteStatusBarProps = {
  url: string;
  copied: boolean;
  onCopy: () => void;
  devToolsAvailable: boolean;
  devToolsOpen: boolean;
  isTogglingDevTools: boolean;
  onToggleDevTools: () => void;
};

export const BlockRouteStatusBar = ({
  url,
  copied,
  onCopy,
  devToolsAvailable,
  devToolsOpen,
  isTogglingDevTools,
  onToggleDevTools,
}: BlockRouteStatusBarProps) => {
  return (
    <div
      style={{
        height: "28px",
        backgroundColor: "#fff",
        borderTop: "1px solid #e0e0e0",
        display: "flex",
        alignItems: "center",
        gap: "8px",
        paddingLeft: "6px",
        paddingRight: "6px",
        fontSize: "11px",
        fontFamily: "monospace",
        color: "#666",
      }}
    >
      <span aria-hidden="true">🌐</span>
      <button
        type="button"
        onClick={onCopy}
        title={url}
        aria-label={copied ? "Copied link" : "Copy link"}
        style={{
          flex: 1,
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          border: 0,
          background: "transparent",
          padding: 0,
          color: "inherit",
          font: "inherit",
          textAlign: "left",
          cursor: "pointer",
        }}
      >
        {copied ? "Copied · " : ""}
        {url}
      </button>
      <ClipDraftsButton />
      {devToolsAvailable && (
        <button
          type="button"
          onClick={onToggleDevTools}
          disabled={isTogglingDevTools}
          aria-pressed={devToolsOpen}
          title={devToolsOpen ? "Close developer tools" : "Open developer tools"}
          style={{
            border: 0,
            background: "transparent",
            padding: "0 2px",
            color: devToolsOpen ? "#1c7ed6" : "inherit",
            font: "inherit",
            cursor: isTogglingDevTools ? "wait" : "pointer",
          }}
        >
          {isTogglingDevTools ? "…" : "DevTools"}
        </button>
      )}
    </div>
  );
};
