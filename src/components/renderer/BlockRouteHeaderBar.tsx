import React from "react";

type BlockRouteHeaderBarProps = {
  canGoBack: boolean;
  isNavigatingBack: boolean;
  onGoBack: () => void;
  urlString: string;
  copied: boolean;
  onCopy: () => void;
  devToolsAvailable: boolean;
  devToolsOpen: boolean;
  isTogglingDevTools: boolean;
  onToggleDevTools: () => void;
};

export const BlockRouteHeaderBar = ({
  canGoBack,
  isNavigatingBack,
  onGoBack,
  urlString,
  copied,
  onCopy,
  devToolsAvailable,
  devToolsOpen,
  isTogglingDevTools,
  onToggleDevTools,
}: BlockRouteHeaderBarProps) => {
  return (
    <div
      style={{
        height: "34px",
        padding: "0 6px",
        backgroundColor: "#fff",
        borderBottom: "1px solid #e0e0e0",
        display: "flex",
        alignItems: "center",
        gap: "6px",
        flexShrink: 0,
        overflow: "hidden",
        minWidth: 0,
      }}
    >
      <button
        type="button"
        onClick={onGoBack}
        disabled={!canGoBack || isNavigatingBack}
        style={{
          border: "1px solid #d0d0d0",
          backgroundColor: "#fff",
          color: canGoBack ? "#111" : "#bbb",
          borderRadius: "4px",
          padding: "4px 8px",
          cursor: !canGoBack || isNavigatingBack ? "not-allowed" : "pointer",
          fontSize: "13px",
          minWidth: "32px",
          height: "26px",
          lineHeight: "1",
        }}
        title={canGoBack ? "Go back" : "No previous page available"}
        aria-disabled={!canGoBack}
      >
        {isNavigatingBack ? "⏳" : "←"}
      </button>
      <span aria-hidden="true" style={{ fontSize: "13px" }}>
        🌐
      </span>
      <button
        type="button"
        onClick={onCopy}
        style={{
          flex: 1,
          minWidth: 0,
          fontFamily: "monospace",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          userSelect: "text",
          background: "none",
          border: "none",
          padding: 0,
          textAlign: "left",
          cursor: "pointer",
          color: "#111",
          fontSize: "12px",
          height: "26px",
          lineHeight: "26px",
        }}
        title={urlString}
        aria-label={copied ? "Copied link" : "Copy link"}
      >
        {urlString}
      </button>
      {devToolsAvailable && (
        <button
          type="button"
          onClick={onToggleDevTools}
          disabled={isTogglingDevTools}
          aria-pressed={devToolsOpen}
          style={{
            border: "1px solid #d0d0d0",
            backgroundColor: devToolsOpen ? "#e7f5ff" : "#fff",
            color: devToolsOpen ? "#1c7ed6" : "#333",
            borderRadius: "4px",
            padding: "4px 8px",
            cursor: isTogglingDevTools ? "wait" : "pointer",
            fontSize: "12px",
            height: "26px",
            lineHeight: "1",
          }}
          title={
            devToolsOpen ? "Close developer tools" : "Open developer tools"
          }
        >
          {isTogglingDevTools
            ? "…"
            : devToolsOpen
              ? "DevTools"
              : "DevTools"}
        </button>
      )}
    </div>
  );
};
