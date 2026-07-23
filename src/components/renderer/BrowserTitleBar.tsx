import React, { useEffect, useMemo, useState } from "react";
import { BrowserLoadStatus } from "../../types/browser";
import "./BrowserTitleBar.css";

type BrowserTitleBarProps = {
  url: string;
  loadStatus: BrowserLoadStatus;
  onReload: () => void;
  copied: boolean;
  onCopy: () => void;
  devToolsAvailable: boolean;
  devToolsOpen: boolean;
  isTogglingDevTools: boolean;
  onToggleDevTools: () => void;
};

const PageStatusIcon = ({
  url,
  loadStatus,
}: {
  url: string;
  loadStatus: BrowserLoadStatus;
}) => {
  const [faviconFailed, setFaviconFailed] = useState(false);
  const faviconUrl = useMemo(() => {
    try {
      return new URL("/favicon.ico", url).toString();
    } catch {
      return null;
    }
  }, [url]);

  useEffect(() => {
    setFaviconFailed(false);
  }, [faviconUrl]);

  return (
    <span className={`sky-status-icon sky-status-icon--${loadStatus}`} aria-hidden="true">
      {loadStatus === "loading" && (
        <svg viewBox="0 0 20 20">
          <path className="sky-status-icon__moon" d="M13.9 14.7A6.2 6.2 0 0 1 8.5 4.1a5.5 5.5 0 1 0 5.4 10.6Z" />
          <circle className="sky-status-icon__star sky-status-icon__star--one" cx="14.8" cy="5.2" r="1" />
          <circle className="sky-status-icon__star sky-status-icon__star--two" cx="16.2" cy="9.2" r=".65" />
        </svg>
      )}
      {loadStatus === "loaded" && (
        <>
          {(!faviconUrl || faviconFailed) && (
            <svg className="sky-status-icon__sun" viewBox="0 0 20 20">
              <circle cx="10" cy="10" r="4" />
              <path d="M10 1.5v2M10 16.5v2M1.5 10h2M16.5 10h2M4 4l1.4 1.4M14.6 14.6 16 16M16 4l-1.4 1.4M5.4 14.6 4 16" />
            </svg>
          )}
          {faviconUrl && !faviconFailed && (
            <img
              className="sky-status-icon__favicon"
              src={faviconUrl}
              alt=""
              onError={() => setFaviconFailed(true)}
            />
          )}
        </>
      )}
      {loadStatus === "error" && (
        <svg className="sky-status-icon__cloud" viewBox="0 0 20 20">
          <path d="M5.2 14.7h9.4a3 3 0 0 0 .3-6 5 5 0 0 0-9.5 1.1 2.5 2.5 0 0 0-.2 4.9Z" />
          <path d="m8.2 16.2-.8 1.5M12.5 16.2l-.8 1.5" />
        </svg>
      )}
    </span>
  );
};

export const BrowserTitleBar = ({
  url,
  loadStatus,
  onReload,
  copied,
  onCopy,
  devToolsAvailable,
  devToolsOpen,
  isTogglingDevTools,
  onToggleDevTools,
}: BrowserTitleBarProps) => {
  return (
    <div
      className="app-title-bar browser-title-bar"
      style={{
        height: "100%",
        backgroundColor: "var(--digest-chrome-surface)",
        display: "flex",
        alignItems: "center",
        gap: "8px",
        paddingLeft: "78px",
        paddingRight: "6px",
        fontSize: "11px",
        fontFamily: "monospace",
        color: "var(--digest-chrome-text)",
      }}
    >
      <div
        className={`browser-location-zone browser-location-zone--${loadStatus} app-title-bar__control`}
      >
        <span className="browser-load-control">
        <span
          className="browser-load-indicator"
          role="img"
          aria-label={
            loadStatus === "loading"
              ? "Page loading"
              : loadStatus === "error"
                ? "Page failed to load"
                : "Page loaded"
          }
          title={
            loadStatus === "loading"
              ? "Loading page"
              : loadStatus === "error"
                ? "Page failed to load"
                : "Page loaded"
          }
        >
          <PageStatusIcon url={url} loadStatus={loadStatus} />
        </span>
        <button
          className="browser-load-control__refresh app-title-bar__control"
          type="button"
          onClick={onReload}
          title="Refresh page"
          aria-label="Refresh page"
        >
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M13 4.5V1.75M13 4.5h-2.75M13 4.5A5.5 5.5 0 1 0 13.2 11" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        </span>
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
            textAlign: "center",
            cursor: "pointer",
          }}
        >
          {copied ? "Copied · " : ""}
          {url}
        </button>
        {devToolsAvailable && (
          <button
            className="browser-devtools-button app-title-bar__control"
            type="button"
            onClick={onToggleDevTools}
            disabled={isTogglingDevTools}
            aria-pressed={devToolsOpen}
            title={devToolsOpen ? "Close developer tools" : "Open developer tools"}
            style={{
              border: 0,
              background: "transparent",
              height: "24px",
              padding: 0,
              color: devToolsOpen ? "#1c7ed6" : "inherit",
              font: "inherit",
              cursor: isTogglingDevTools ? "wait" : "pointer",
            }}
          >
            {isTogglingDevTools ? (
              "…"
            ) : (
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="m5 4-3 4 3 4M11 4l3 4-3 4M9.5 2.5l-3 11" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>
        )}
      </div>
    </div>
  );
};
