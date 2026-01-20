import React, { useContext, useMemo } from "react";
import { useCopyToClipboard } from "../../hooks/useCopyToClipboard";
import { useDevToolsState } from "../../hooks/useDevToolsState";
import { useBrowserNavigationState } from "../../hooks/useBrowserNavigationState";
import { Page } from "../../Browser/components/Page";
import { useRendererRoute } from "../../context/RendererRouteContext";
import { PageToolSlotContext } from "../../context/PageToolSlotContext";
import { DocumentProvider } from "../../context/DocumentContext";
import { ClipButtons } from "../clip/ClipButtons";
import { DEFAULT_PROFILE_ID } from "../../config/profiles";
import { BlockNotificationContainer } from "./BlockNotificationContainer";
import { CustomBlockNoteEditor } from "../../types/schema";
import { BlockNotificationContext } from "../../context/BlockNotificationContext";

const NOTIFICATION_HEIGHT = 120; // Top bar (~32px) + content (80px) + padding

type BlockRouteViewProps = {
  blockId: string;
  docId: string | null;
  profileId: string | null;
  url: string | null;
  title: string;
  viewId: string;
  editor: CustomBlockNoteEditor;
  onUrlChange?: (url: string) => void;
  onReady?: (viewId: string) => void;
};

export const BlockRouteView = ({
  blockId,
  docId,
  profileId,
  url,
  title,
  viewId,
  editor,
  onUrlChange,
  onReady,
}: BlockRouteViewProps) => {
  const routeContext = useRendererRoute();

  // All hooks must be called before any conditional returns
  const urlString = url ?? "";
  const { copied, copy: handleCopy } = useCopyToClipboard(urlString);
  const {
    isAvailable: devToolsAvailable,
    isOpen: devToolsOpen,
    isBusy: isTogglingDevTools,
    toggleDevTools,
  } = useDevToolsState(viewId);
  const { canGoBack, isNavigatingBack, goBack } = useBrowserNavigationState(
    viewId,
    urlString,
    {
      blockIdForEditorSync: blockId,
      onUrlChange,
      editor,
    }
  );
  // Get page tool slot content
  const pageToolContext = useContext(PageToolSlotContext);
  const pageToolContent = pageToolContext?.content ?? null;
  const isPageToolVisible = pageToolContext?.isVisible ?? false;
  const hasPageTool = pageToolContent !== null && isPageToolVisible;

  // Get notification state to add margin when notifications are active
  const notificationContext = useContext(BlockNotificationContext);
  const hasActiveNotifications = notificationContext
    ? notificationContext.pendingBlockIds.length > 0
    : false;

  // Build grid template rows conditionally (must be before conditional return)
  const gridTemplateRows = useMemo(() => {
    return `34px 1fr 28px${hasPageTool ? " auto" : ""}`;
  }, [hasPageTool]);

  // Build grid template columns: left toggle bar + main content
  const gridTemplateColumns = "2rem 1fr";

  // Type guard: ensure we're on a block route
  if (routeContext.route.kind !== "block") {
    return null;
  }

  const { navigateToDoc } = routeContext;

  const handleMinimize = () => {
    if (docId) {
      navigateToDoc(docId, blockId);
    } else {
      window.history.back();
    }
  };

  if (!url) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#f5f6f8",
          color: "#333",
          flexDirection: "column",
          gap: "8px",
        }}
      >
        <div style={{ fontWeight: 600 }}>Unable to load this site block.</div>
        <div style={{ fontSize: "0.9rem", color: "#666" }}>
          {title} is missing a URL.
        </div>
        <button
          type="button"
          onClick={handleMinimize}
          style={{
            padding: "8px 16px",
            borderRadius: "12px",
            border: "1px solid #d0d7de",
            cursor: "pointer",
            backgroundColor: "#fff",
          }}
        >
          Back
        </button>
      </div>
    );
  }

  const resolvedProfileId = profileId ?? DEFAULT_PROFILE_ID;

  return (
    <DocumentProvider profileId={resolvedProfileId} documentId={docId}>
      <div
        style={{
          height: "100vh",
          backgroundColor: "#f5f6f8",
          display: "grid",
          gridTemplateColumns,
          gridTemplateRows: "1fr",
          gap: 0,
          padding: 0,
          overflow: "hidden",
        }}
      >
        {/* Left sidebar - minimize/expand toggle */}
        <button
          type="button"
          onClick={handleMinimize}
          style={{
            width: "2rem",
            height: "100%",
            border: "none",
            borderRight: "1px solid #e0e0e0",
            backgroundColor: "#e7f5ff",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 0,
            transition: "background-color 150ms ease",
          }}
          title="Back to document"
          aria-label="Collapse block"
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "#d0ebff";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "#e7f5ff";
          }}
        >
          <span
            style={{
              color: "#1c7ed6",
              fontSize: "14px",
              fontWeight: 600,
              writingMode: "vertical-rl",
              textOrientation: "mixed",
              transform: "rotate(180deg)",
              userSelect: "none",
            }}
          >
            ‹
          </span>
        </button>

        {/* Main content area */}
        <div
          style={{
            display: "grid",
            gridTemplateRows,
            gap: 0,
            overflow: "hidden",
            transition: "grid-template-rows 180ms ease",
          }}
        >
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
              onClick={goBack}
              disabled={!canGoBack || isNavigatingBack}
              style={{
                border: "1px solid #d0d0d0",
                backgroundColor: "#fff",
                color: canGoBack ? "#111" : "#bbb",
                borderRadius: "4px",
                padding: "4px 8px",
                cursor:
                  !canGoBack || isNavigatingBack ? "not-allowed" : "pointer",
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
              onClick={handleCopy}
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
                onClick={toggleDevTools}
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

        <div
          style={{
            minHeight: 0,
            backgroundColor: "#fff",
            overflow: "hidden",
            marginBottom: hasActiveNotifications ? NOTIFICATION_HEIGHT : 0,
            transition: "margin-bottom 0.3s ease-out",
          }}
        >
          <Page
            blockId={blockId}
            url={urlString}
            layout="full"
            viewId={viewId}
            onReady={onReady}
          />
        </div>

        {/* Bottom status bar with clip button */}
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
          <span
            style={{
              userSelect: "none",
              color: "#666",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              minWidth: 0,
              maxWidth: "60%",
            }}
          >
            {title || urlString}
          </span>
          <ClipButtons context="page" viewId={viewId} placement="toolbar" />
        </div>

          {/* Page tool slot (e.g., clip inbox) */}
          {hasPageTool && (
            <div
              style={{
                backgroundColor: "#fff",
                borderTop: "1px solid #e0e0e0",
                overflow: "hidden",
              }}
            >
              {pageToolContent}
            </div>
          )}
        </div>
      </div>
      <BlockNotificationContainer editor={editor} />
    </DocumentProvider>
  );
};
