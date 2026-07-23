import React, { useCallback, useContext, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useCopyToClipboard } from "../../hooks/useCopyToClipboard";
import { useDevToolsState } from "../../hooks/useDevToolsState";
import { useBrowserNavigationState } from "../../hooks/useBrowserNavigationState";
import { Page } from "../../Browser/components/Page";
import { PageToolSlotContext } from "../../context/PageToolSlotContext";
import { DocumentProvider } from "../../context/DocumentContext";
import { DEFAULT_PROFILE_ID } from "../../config/profiles";
import { BlockRoutePageToolSlot } from "./BlockRoutePageToolSlot";
import { LeftRail } from "./LeftRail";
import { BrowserTitleBar } from "./BrowserTitleBar";
import { CustomBlockNoteEditor, CustomPartialBlock } from "../../types/schema";
import { useBrowserLoadState } from "../../hooks/useBrowserLoadState";
import { useTitleBar } from "../../context/TitleBarContext";

type BlockRouteViewContentProps = {
  blockId: string | undefined; // undefined for ephemeral URL routes
  docId: string | null;
  profileId: string | null;
  url: string;
  title: string;
  viewId: string;
  editor: CustomBlockNoteEditor;
  onUrlChange?: (url: string) => void;
  onBack: () => void;
};

export const BlockRouteViewContent = ({
  blockId,
  docId,
  profileId,
  url,
  viewId,
  editor,
  onUrlChange,
  onBack,
}: BlockRouteViewContentProps) => {
  const urlString = url;
  const loadStatus = useBrowserLoadState(viewId);

  const initialUrlRef = useRef(urlString);
  const [currentBrowserUrl, setCurrentBrowserUrl] = useState(urlString);

  // Use the live browser URL for display and clipboard
  const displayUrl = currentBrowserUrl || urlString;
  const { copied, copy: handleCopy } = useCopyToClipboard(displayUrl);
  const {
    isAvailable: devToolsAvailable,
    isOpen: devToolsOpen,
    isBusy: isTogglingDevTools,
    toggleDevTools,
  } = useDevToolsState(viewId);

  const handleUrlChange = useCallback(
    (nextUrl: string) => {
      setCurrentBrowserUrl(nextUrl);
      onUrlChange?.(nextUrl);
    },
    [onUrlChange]
  );

  const { canGoBack, isNavigatingBack, goBack } = useBrowserNavigationState(
    viewId,
    urlString,
    {
      blockIdForEditorSync: blockId ?? undefined, // Only sync if blockId exists
      onUrlChange: handleUrlChange,
      editor,
    }
  );

  const handleBack = useCallback(() => {
    // Navigation events sync the live URL to an existing site block. Keep the
    // block as the original notebook entry when leaving the full-page browser.
    if (blockId) {
      try {
        const block = editor.getBlock(blockId);
        if (block && block.type === "site") {
          editor.updateBlock(block, {
            props: {
              ...block.props,
              url: initialUrlRef.current,
            },
          } as CustomPartialBlock);
        }
      } catch (error) {
        console.error("[BlockRouteViewContent] Failed to restore block URL:", error);
      }
    }

    onBack();
  }, [blockId, editor, onBack]);

  const handleReload = useCallback(() => {
    void window.electronAPI.browser.reload(viewId).then((result) => {
      if (!result.success) {
        console.error(
          "[BlockRouteViewContent] Failed to reload page:",
          result.error
        );
      }
    });
  }, [viewId]);

  // Get page tool slot content
  const pageToolContext = useContext(PageToolSlotContext);
  const pageToolContent = pageToolContext?.content ?? null;
  const isPageToolVisible = pageToolContext?.isVisible ?? false;
  const hasPageTool = pageToolContent !== null && isPageToolVisible;

  // Build grid template rows conditionally
  const gridTemplateRows = useMemo(() => {
    return `1fr${hasPageTool ? " auto" : ""}`;
  }, [hasPageTool]);

  const { setContextualContent } = useTitleBar();
  const siteTitleBar = useMemo(
    () => (
      <BrowserTitleBar
        url={displayUrl}
        loadStatus={loadStatus}
        onReload={handleReload}
        copied={copied}
        onCopy={handleCopy}
        devToolsAvailable={devToolsAvailable}
        devToolsOpen={devToolsOpen}
        isTogglingDevTools={isTogglingDevTools}
        onToggleDevTools={toggleDevTools}
      />
    ),
    [
      copied,
      devToolsAvailable,
      devToolsOpen,
      displayUrl,
      handleCopy,
      handleReload,
      isTogglingDevTools,
      loadStatus,
      toggleDevTools,
    ]
  );

  useLayoutEffect(() => {
    setContextualContent(siteTitleBar);
    return () => setContextualContent(null);
  }, [setContextualContent, siteTitleBar]);

  const resolvedProfileId = profileId ?? DEFAULT_PROFILE_ID;

  return (
    <DocumentProvider profileId={resolvedProfileId} documentId={docId}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          backgroundColor: "#f5f6f8",
          display: "grid",
          gridTemplateColumns: `2rem minmax(0, 1fr)`,
          gridTemplateRows: "1fr",
          gap: 0,
          padding: 0,
          overflow: "hidden",
        }}
      >
        {/* Left sidebar - minimize/expand toggle */}
        <LeftRail
          viewId={viewId}
          onBack={handleBack}
          canGoBrowserBack={canGoBack}
          isNavigatingBrowserBack={isNavigatingBack}
          onBrowserBack={goBack}
        />

        {/* Main content area */}
        <div
          style={{
            display: "grid",
            gridTemplateRows,
            minWidth: 0,
            minHeight: 0,
            gap: 0,
            overflow: "hidden",
            transition: "grid-template-rows 180ms ease",
          }}
        >
          <div
            style={{
              minHeight: 0,
              backgroundColor: "#fff",
              overflow: "hidden",
            }}
          >
            <Page
              blockId={blockId}
              url={urlString}
              layout="full"
              viewId={viewId}
            />
          </div>

          <BlockRoutePageToolSlot
            content={pageToolContent}
            isVisible={hasPageTool}
          />
        </div>
      </div>
    </DocumentProvider>
  );
};
