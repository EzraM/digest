import React, { useEffect, useMemo, useState } from "react";
import { BrowserLoadStatus } from "../../types/browser";
import "./BrowserTitleBar.css";
import { ResolvedPageBreadcrumb } from "../../domains/page-context/resolvePageBreadcrumb";
import { AddPageButton } from "../clip/AddPageButton";
import { NotebookAddress } from "../../domains/notebook-content/core/NotebookAddress";
import { NotebookWriteClient } from "../../domains/notebook-content/application/NotebookWriteClient";

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
  breadcrumb: ResolvedPageBreadcrumb | null;
  onReturn: () => void;
  viewId: string;
  notebookAddress: NotebookAddress;
  notebookWriter: NotebookWriteClient;
  canGoBrowserBack: boolean;
  isNavigatingBrowserBack: boolean;
  onBrowserBack: () => void;
};

const BackIcon = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M13 8H3M7 4 3 8l4 4" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const NotebookIcon = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <rect x="3" y="2.5" width="10" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.35" />
    <path d="M6 2.5v11M8.5 6h2M8.5 8.5h2" stroke="currentColor" strokeWidth="1.15" strokeLinecap="round" />
  </svg>
);

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
  breadcrumb,
  onReturn,
  viewId,
  notebookAddress,
  notebookWriter,
  canGoBrowserBack,
  isNavigatingBrowserBack,
  onBrowserBack,
}: BrowserTitleBarProps) => {
  const [actionHint, setActionHint] = useState("Open notebook");
  const showActionHint = (label: string) => () => setActionHint(label);
  const resetActionHint = () => setActionHint("Open notebook");
  const nearestHeading = breadcrumb?.headingPath.at(-1);
  const returnDescription = breadcrumb
    ? `Return to ${[breadcrumb.notebookTitle, nearestHeading?.text].filter(Boolean).join(", ")}`
    : undefined;
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
      <div className="browser-title-actions app-title-bar__control">
        <div className="browser-title-actions__secondary">
          <button
            className="browser-title-action"
            type="button"
            onClick={onReturn}
            onMouseEnter={showActionHint("Open notebook")}
            onMouseLeave={resetActionHint}
            onFocus={showActionHint("Open notebook")}
            onBlur={resetActionHint}
            title="Back to notebook"
            aria-label="Back to notebook"
          >
            <NotebookIcon />
          </button>
          {canGoBrowserBack && (
            <button
              className="browser-title-action"
              type="button"
              onClick={onBrowserBack}
              onMouseEnter={showActionHint("Go back")}
              onMouseLeave={resetActionHint}
              onFocus={showActionHint("Go back")}
              onBlur={resetActionHint}
              disabled={isNavigatingBrowserBack}
              title="Go back in browser"
              aria-label="Go back in browser"
            >
              {isNavigatingBrowserBack ? "…" : <BackIcon />}
            </button>
          )}
        </div>
      </div>
      <div
        className={`browser-location-zone browser-location-zone--${loadStatus} app-title-bar__control`}
      >
        <span className="browser-load-control">
          <AddPageButton
            viewId={viewId}
            notebookAddress={notebookAddress}
            notebookWriter={notebookWriter}
            className="browser-add-button app-title-bar__control"
            onInteractionStart={showActionHint("Add to notebook")}
            onInteractionEnd={resetActionHint}
          />
          <button
            className="browser-load-control__refresh app-title-bar__control"
            type="button"
            onClick={onReload}
            onMouseEnter={showActionHint("Refresh page")}
            onMouseLeave={resetActionHint}
            onFocus={showActionHint("Refresh page")}
            onBlur={resetActionHint}
            title="Refresh page"
            aria-label="Refresh page"
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M13 4.5V1.75M13 4.5h-2.75M13 4.5A5.5 5.5 0 1 0 13.2 11" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </span>
        {breadcrumb ? (
          <button
            type="button"
            className="browser-authored-breadcrumb"
            onClick={onReturn}
            title={`${returnDescription}. Current URL: ${url}`}
            aria-label={returnDescription}
          >
            <span className="browser-authored-breadcrumb__notebook">
              {breadcrumb.notebookTitle}
            </span>
            {nearestHeading && (
              <>
                <span className="browser-authored-breadcrumb__separator">/</span>
                <span className="browser-authored-breadcrumb__heading">
                  {nearestHeading.text}
                </span>
              </>
            )}
            {breadcrumb.linkLabel && (
              <>
                <span className="browser-authored-breadcrumb__separator">/</span>
                <span className="browser-authored-breadcrumb__page">
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
                  >
                    <PageStatusIcon url={url} loadStatus={loadStatus} />
                  </span>
                  <span className="browser-authored-breadcrumb__label">
                    {breadcrumb.linkLabel}
                  </span>
                </span>
              </>
            )}
            <span className="app-title-bar__hint browser-authored-breadcrumb__hint">
              {actionHint}
            </span>
          </button>
        ) : (
          <button
            type="button"
            className="browser-authored-breadcrumb"
            onClick={onReturn}
            title={`Open notebook. Current URL: ${url}`}
            aria-label="Open notebook"
          >
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
            >
              <PageStatusIcon url={url} loadStatus={loadStatus} />
            </span>
            <span className="browser-url-label" title={url}>{url}</span>
            <span className="app-title-bar__hint browser-authored-breadcrumb__hint">
              {actionHint}
            </span>
          </button>
        )}
        <span className="browser-location-actions">
          {devToolsAvailable && (
            <button
              className="browser-devtools-button app-title-bar__control"
              type="button"
              onClick={onToggleDevTools}
              onMouseEnter={showActionHint(devToolsOpen ? "Close devtools" : "Open devtools")}
              onMouseLeave={resetActionHint}
              onFocus={showActionHint(devToolsOpen ? "Close devtools" : "Open devtools")}
              onBlur={resetActionHint}
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
          <button
            className="browser-copy-button app-title-bar__control"
            type="button"
            onClick={onCopy}
            onMouseEnter={showActionHint(copied ? "Copied" : "Copy link")}
            onMouseLeave={resetActionHint}
            onFocus={showActionHint(copied ? "Copied" : "Copy link")}
            onBlur={resetActionHint}
            title={copied ? "Copied" : `Copy ${url}`}
            aria-label={copied ? "Copied link" : "Copy link"}
          >
            {copied ? "Copied" : (
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <rect x="5.25" y="5.25" width="7.5" height="7.5" rx="1.25" stroke="currentColor" strokeWidth="1.35" />
                <path d="M10.5 5.25V3.5A1.25 1.25 0 0 0 9.25 2.25H3.5A1.25 1.25 0 0 0 2.25 3.5v5.75A1.25 1.25 0 0 0 3.5 10.5h1.75" stroke="currentColor" strokeWidth="1.35" />
              </svg>
            )}
          </button>
        </span>
      </div>
    </div>
  );
};
