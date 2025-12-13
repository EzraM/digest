import { ReactNode, useMemo, useContext, useRef, useEffect } from "react";
import { Box, Transition } from "@mantine/core";
import { StatusBar } from "./StatusBar";
import { useStatusBar } from "../../hooks/useStatusBar";
import { SidebarToggleButton } from "./SidebarToggleButton";
import { BlockNotificationContext } from "../../context/BlockNotificationContext";
import { PageToolSlotContext } from "../../context/PageToolSlotContext";
import { ScrollContainerProvider } from "../../context/ScrollContainerContext";
import { log } from "../../utils/rendererLogger";

const NAVBAR_WIDTH = 320;
const ASIDE_WIDTH = 400;
const FOOTER_HEIGHT = 28;
const TOGGLE_SAFE_SPACE = 56;
const NOTIFICATION_HEIGHT = 120; // Top bar (~32px) + content (80px) + padding
const NAVBAR_TRANSITION_MS = 180;

type RendererLayoutProps = {
  navbar: ReactNode;
  main: ReactNode;
  aside: ReactNode;
  isNavbarOpened: boolean;
  onNavbarToggle: () => void;
  isDebugSidebarVisible: boolean;
  profileName: string | null;
  documentTitle: string | null;
};

export const RendererLayout = ({
  navbar,
  main,
  aside,
  isNavbarOpened,
  onNavbarToggle,
  isDebugSidebarVisible,
  profileName,
  documentTitle,
}: RendererLayoutProps) => {
  const { breadcrumbText, handleClick } = useStatusBar({
    profileName,
    documentTitle,
    onToggleSidebar: onNavbarToggle,
  });

  // Get notification state to add margin when notifications are active
  const notificationContext = useContext(BlockNotificationContext);
  const hasActiveNotifications = notificationContext
    ? notificationContext.pendingBlockIds.length > 0
    : false;

  // Get page tool slot content
  const pageToolContext = useContext(PageToolSlotContext);
  const pageToolContent = pageToolContext?.content ?? null;
  const hasPageTool = pageToolContent !== null;
  
  useEffect(() => {
    if (hasPageTool) {
      log.debug("RendererLayout: Page tool content detected, hasPageTool=true", "RendererLayout");
    } else {
      log.debug("RendererLayout: No page tool content, hasPageTool=false", "RendererLayout");
    }
  }, [hasPageTool]);

  const { navWidth, asideWidth } = useMemo(
    () => ({
      navWidth: isNavbarOpened ? NAVBAR_WIDTH : 0,
      asideWidth: isDebugSidebarVisible ? ASIDE_WIDTH : 0,
    }),
    [isNavbarOpened, isDebugSidebarVisible]
  );

  const scrollContainerRef = useRef<HTMLElement>(null);

  // Build grid template rows and areas conditionally
  const gridTemplateRows = `minmax(0, 1fr) ${FOOTER_HEIGHT}px${hasPageTool ? " auto" : ""}`;
  const gridTemplateAreas = `"nav main aside" "footer footer footer"${hasPageTool ? ' "tool tool tool"' : ""}`;

  return (
    <Box
      style={{
        display: "grid",
        gridTemplateColumns: `${navWidth}px 1fr ${asideWidth}px`,
        gridTemplateRows,
        gridTemplateAreas,
        height: "100vh",
        position: "relative",
        backgroundColor: "var(--mantine-color-body)",
        transition: `grid-template-columns ${NAVBAR_TRANSITION_MS}ms ease, grid-template-rows ${NAVBAR_TRANSITION_MS}ms ease`,
      }}
    >
      <Box
        component="nav"
        style={{
          gridArea: "nav",
          display: "block",
          minWidth: navWidth,
          maxWidth: navWidth,
          borderRight: navWidth
            ? "1px solid var(--mantine-color-default-border)"
            : "none",
          overflow: "hidden",
          transition: `min-width ${NAVBAR_TRANSITION_MS}ms ease, max-width ${NAVBAR_TRANSITION_MS}ms ease, border-color 120ms ease`,
          pointerEvents: isNavbarOpened ? "auto" : "none",
        }}
        p="md"
      >
        <Transition
          mounted={isNavbarOpened}
          transition="slide-right"
          duration={NAVBAR_TRANSITION_MS}
          timingFunction="ease-out"
          keepMounted
          reduceMotion
        >
          {(styles) => (
            <Box style={{ height: "100%", ...styles }}>{navbar}</Box>
          )}
        </Transition>
      </Box>

      <ScrollContainerProvider scrollContainerRef={scrollContainerRef}>
        <Box
          component="main"
          ref={scrollContainerRef}
          id="renderer-main-scroll-container"
          style={{
            gridArea: "main",
            position: "relative",
            zIndex: 0,
            paddingBottom: FOOTER_HEIGHT + 8,
            paddingLeft: isNavbarOpened ? 0 : TOGGLE_SAFE_SPACE,
            marginBottom: hasActiveNotifications ? NOTIFICATION_HEIGHT : 0,
            overflow: "auto",
            transition: `margin-bottom 0.3s ease-out, padding-left ${NAVBAR_TRANSITION_MS}ms ease`,
          }}
        >
          {main}
        </Box>
      </ScrollContainerProvider>

      <Box
        component="aside"
        style={{
          gridArea: "aside",
          display: asideWidth ? "block" : "none",
          minWidth: asideWidth,
          maxWidth: asideWidth,
          borderLeft: asideWidth
            ? "1px solid var(--mantine-color-default-border)"
            : "none",
          overflow: "hidden",
        }}
        p="md"
      >
        {aside}
      </Box>

      <Box
        component="footer"
        style={{
          gridArea: "footer",
          height: FOOTER_HEIGHT,
          backgroundColor: "var(--mantine-color-body)",
          borderTop: "1px solid var(--mantine-color-default-border)",
          display: "flex",
          alignItems: "center",
          zIndex: 1,
        }}
        p={0}
      >
        <StatusBar breadcrumbText={breadcrumbText} onClick={handleClick} />
      </Box>

      {hasPageTool && (
        <Box
          style={{
            gridArea: "tool",
            backgroundColor: "var(--mantine-color-body)",
            borderTop: "1px solid var(--mantine-color-default-border)",
            overflow: "hidden",
          }}
        >
          {pageToolContent}
        </Box>
      )}

      <SidebarToggleButton
        isOpen={isNavbarOpened}
        navWidth={navWidth || NAVBAR_WIDTH}
        onToggle={onNavbarToggle}
      />
    </Box>
  );
};
