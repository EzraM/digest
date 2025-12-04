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
          minHeight: "100vh",
          backgroundColor: "#f5f6f8",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
          padding: "16px",
        }}
      >
        <div
          style={{
            padding: "10px 12px",
            backgroundColor: "#fff",
            border: "1px solid #e0e0e0",
            borderRadius: "10px",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            boxShadow: "0 4px 16px rgba(0,0,0,0.06)",
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
              borderRadius: "6px",
              padding: "6px 10px",
              cursor:
                !canGoBack || isNavigatingBack ? "not-allowed" : "pointer",
              fontSize: "14px",
              minWidth: "40px",
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
              borderRadius: "6px",
              padding: "6px 10px",
              cursor: "pointer",
              fontSize: "14px",
              minWidth: "40px",
            }}
            title="Back to document"
            aria-label="Collapse block"
          >
            ⊟
          </button>
          <span aria-hidden="true">🌐</span>
          <button
            type="button"
            onClick={handleCopy}
            style={{
              flex: 1,
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
            }}
            title={copied ? "Copied!" : "Copy link"}
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
                borderRadius: "6px",
                padding: "6px 10px",
                cursor: isTogglingDevTools ? "wait" : "pointer",
                fontSize: "14px",
              }}
              title={
                devToolsOpen ? "Close developer tools" : "Open developer tools"
              }
            >
              {isTogglingDevTools
                ? "…"
                : devToolsOpen
                  ? "Close DevTools"
                  : "Open DevTools"}
            </button>
          )}
        </div>

        <div
          style={{
            flex: 1,
            minHeight: 0,
            backgroundColor: "#fff",
            border: "1px solid #e0e0e0",
            borderRadius: "12px",
            overflow: "hidden",
            boxShadow: "0 12px 32px rgba(0,0,0,0.08)",
          }}
        >
          <Page blockId={blockId} url={url} layout="full" />
        </div>
      </div>
    </DocumentProvider>
  );
};
