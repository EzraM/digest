import React, { useCallback, useContext, useMemo, useRef, useState } from "react";
import { useCopyToClipboard } from "../../hooks/useCopyToClipboard";
import { useDevToolsState } from "../../hooks/useDevToolsState";
import { useBrowserNavigationState } from "../../hooks/useBrowserNavigationState";
import { Page } from "../../Browser/components/Page";
import { PageToolSlotContext } from "../../context/PageToolSlotContext";
import { DocumentProvider } from "../../context/DocumentContext";
import { DEFAULT_PROFILE_ID } from "../../config/profiles";
import { BlockRouteNotificationsRow } from "./BlockRouteNotificationsRow";
import { BlockRoutePageToolSlot } from "./BlockRoutePageToolSlot";
import { LeftRail } from "./LeftRail";
import { BlockRouteStatusBar } from "./BlockRouteStatusBar";
import { CustomBlockNoteEditor, CustomPartialBlock } from "../../types/schema";
import { BlockNotificationContext } from "../../context/BlockNotificationContext";

type BlockRouteViewContentProps = {
  blockId: string | undefined; // undefined for ephemeral URL routes
  docId: string | null;
  profileId: string | null;
  url: string;
  title: string;
  viewId: string;
  editor: CustomBlockNoteEditor;
  onUrlChange?: (url: string) => void;
  onReady?: (viewId: string) => void;
  onBack: () => void;
};

const getLinkLabel = (title: string | undefined, url: string): string => {
  const cleanedTitle = title
    ?.replace(/^\(\d+\)\s+/, "")
    .replace(/\s+-\s+YouTube$/i, "")
    .trim();

  return cleanedTitle || url;
};

export const BlockRouteViewContent = ({
  blockId,
  docId,
  profileId,
  url,
  viewId,
  editor,
  onUrlChange,
  onReady,
  onBack,
}: BlockRouteViewContentProps) => {
  const urlString = url;

  // Track the initial URL so we can detect navigation away from the original page
  const initialUrlRef = useRef(urlString);
  const currentBrowserUrlRef = useRef(urlString);
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
      currentBrowserUrlRef.current = nextUrl;
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

  // When toggling back to the notebook, save where the browser ended up. URL
  // routes are intentionally ephemeral, so this must not depend on an existing
  // site block (for example, a ChatGPT query URL may become a conversation URL).
  const handleBack = useCallback(async () => {
    const originalUrl = initialUrlRef.current;
    let finalUrl = currentBrowserUrlRef.current;
    let finalTitle: string | undefined;

    try {
      const pageInfo = await window.electronAPI?.browser.getPageInfo(viewId);
      if (pageInfo?.success) {
        finalUrl = pageInfo.url || finalUrl;
        finalTitle = pageInfo.title;
      }
    } catch (error) {
      console.warn("[BlockRouteViewContent] Failed to read page title:", error);
    }

    if (finalUrl && finalUrl !== originalUrl) {
      const linkLabel = getLinkLabel(finalTitle, finalUrl);
      // Insert a link to the navigated page at the cursor position
      try {
        const cursorPosition = editor.getTextCursorPosition();
        if (cursorPosition) {
          editor.insertBlocks(
            [
              {
                type: "paragraph",
                content: [
                  {
                    type: "link",
                    href: finalUrl,
                    content: [
                      {
                        type: "text",
                        text: linkLabel,
                        styles: {},
                      },
                    ],
                  },
                ],
              } as any,
            ],
            cursorPosition.block,
            "after"
          );
        }
      } catch (error) {
        console.error("[BlockRouteViewContent] Failed to insert page link:", error);
      }

      // Navigation events temporarily sync an existing site block to the live
      // page. Restore its saved launch URL after capturing the final address.
      if (blockId) {
        try {
          const block = editor.getBlock(blockId);
          if (block && block.type === "site") {
            editor.updateBlock(block, {
              props: {
                ...block.props,
                url: originalUrl,
              },
            } as CustomPartialBlock);
          }
        } catch (error) {
          console.error("[BlockRouteViewContent] Failed to restore block URL:", error);
        }
      }
    }

    onBack();
  }, [blockId, editor, onBack, viewId]);
  // Get page tool slot content
  const pageToolContext = useContext(PageToolSlotContext);
  const pageToolContent = pageToolContext?.content ?? null;
  const isPageToolVisible = pageToolContext?.isVisible ?? false;
  const hasPageTool = pageToolContent !== null && isPageToolVisible;

  // Get notification state to add an inline notification row when active
  const notificationContext = useContext(BlockNotificationContext);
  const hasActiveNotifications = notificationContext
    ? notificationContext.pendingBlockIds.length > 0
    : false;

  // Build grid template rows conditionally
  const gridTemplateRows = useMemo(() => {
    return `1fr${hasActiveNotifications ? " auto" : ""} 28px${
      hasPageTool ? " auto" : ""
    }`;
  }, [hasActiveNotifications, hasPageTool]);

  // Build grid template columns: left toggle bar + main content
  const gridTemplateColumns = "2rem 1fr";

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
        <LeftRail
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
              onReady={onReady}
            />
          </div>

          <BlockRouteNotificationsRow
            editor={editor}
            isVisible={hasActiveNotifications}
          />
          <BlockRouteStatusBar
            viewId={viewId}
            url={displayUrl}
            copied={copied}
            onCopy={handleCopy}
            devToolsAvailable={devToolsAvailable}
            devToolsOpen={devToolsOpen}
            isTogglingDevTools={isTogglingDevTools}
            onToggleDevTools={toggleDevTools}
          />
          <BlockRoutePageToolSlot
            content={pageToolContent}
            isVisible={hasPageTool}
          />
        </div>
      </div>
    </DocumentProvider>
  );
};
