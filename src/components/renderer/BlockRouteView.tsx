import React, { useEffect, useMemo, useState } from "react";
import { useCopyToClipboard } from "../../hooks/useCopyToClipboard";
import { useDevToolsState } from "../../hooks/useDevToolsState";
import { useBrowserNavigationState } from "../../hooks/useBrowserNavigationState";
import { Page } from "../../Browser/components/Page";
import { CustomBlockNoteEditor } from "../../types/schema";
import { useRendererRoute } from "../../context/RendererRouteContext";
import { DocumentProvider } from "../../context/DocumentContext";
import { DEFAULT_PROFILE_ID } from "../../config/profiles";

type BlockRouteViewProps = {
  blockId: string;
  docId: string | null;
  profileId: string | null;
  editor: CustomBlockNoteEditor;
};

export const BlockRouteView = ({
  blockId,
  docId,
  profileId,
  editor,
}: BlockRouteViewProps) => {
  const { navigateToDoc } = useRendererRoute();
  const [url, setUrl] = useState<string>("");
  const { copied, copy: handleCopy } = useCopyToClipboard(url);
  const {
    isAvailable: devToolsAvailable,
    isOpen: devToolsOpen,
    isBusy: isTogglingDevTools,
    toggleDevTools,
  } = useDevToolsState(blockId);
  const { canGoBack, isNavigatingBack, goBack } = useBrowserNavigationState(
    blockId,
    editor,
    url
  );

  const blockTitle = useMemo(() => {
    const block = editor.getBlock(blockId);
    return block?.type === "site" ? "Site" : "Block";
  }, [editor, blockId]);

  useEffect(() => {
    const updateFromBlock = () => {
      const block = editor.getBlock(blockId);
      if (!block || block.type !== "site") {
        return;
      }
      const nextUrl = (block.props as { url?: string } | undefined)?.url ?? "";
      setUrl(nextUrl);
    };

    updateFromBlock();
    const unsubscribe = editor.onChange(updateFromBlock);

    return () => {
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    };
  }, [editor, blockId]);

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
          {blockTitle} is missing a URL.
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
          gridTemplateRows: "34px 1fr",
          gap: 0,
          padding: 0,
          overflow: "hidden",
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
          <button
            type="button"
            onClick={handleMinimize}
            style={{
              border: "1px solid #d0d0d0",
              backgroundColor: "#e7f5ff",
              color: "#1c7ed6",
              borderRadius: "4px",
              padding: "4px 8px",
              cursor: "pointer",
              fontSize: "13px",
              minWidth: "32px",
              height: "26px",
              lineHeight: "1",
            }}
            title="Back to document"
            aria-label="Collapse block"
          >
            ⊟
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
            title={url}
            aria-label={copied ? "Copied link" : "Copy link"}
          >
            {url}
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
          }}
        >
          <Page blockId={blockId} url={url} layout="full" />
        </div>
      </div>
    </DocumentProvider>
  );
};
