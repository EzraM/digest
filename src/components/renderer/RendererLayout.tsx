import { ReactNode, useMemo, useContext, useRef, useEffect } from "react";
import { Box, Transition } from "@mantine/core";
import { useElementScrollRestoration } from "@tanstack/react-router";
import { PageToolSlotContext } from "../../context/PageToolSlotContext";
import { ScrollContainerProvider } from "../../context/ScrollContainerContext";

const NAVBAR_WIDTH = 320;
const ASIDE_WIDTH = 400;
const NAVBAR_TRANSITION_MS = 180;

type RendererLayoutProps = {
  navbar: ReactNode;
  main: ReactNode;
  aside: ReactNode;
  isNavbarOpened: boolean;
  isDebugSidebarVisible: boolean;
};

export const RendererLayout = ({
  navbar,
  main,
  aside,
  isNavbarOpened,
  isDebugSidebarVisible,
}: RendererLayoutProps) => {
  // Get page tool slot content
  const pageToolContext = useContext(PageToolSlotContext);
  const pageToolContent = pageToolContext?.content ?? null;
  const isPageToolVisible = pageToolContext?.isVisible ?? false;
  const hasPageTool = pageToolContent !== null && isPageToolVisible;

  const { navWidth, asideWidth } = useMemo(
    () => ({
      navWidth: isNavbarOpened ? NAVBAR_WIDTH : 0,
      asideWidth: isDebugSidebarVisible ? ASIDE_WIDTH : 0,
    }),
    [isNavbarOpened, isDebugSidebarVisible]
  );

  const scrollContainerRef = useRef<HTMLElement>(null);

  // Check what TanStack's scroll restoration returns
  const scrollEntry = useElementScrollRestoration({
    id: "renderer-main-scroll-container",
  });

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || !scrollEntry || typeof scrollEntry.scrollY !== "number") {
      return;
    }

    if (Math.abs(container.scrollTop - scrollEntry.scrollY) < 1) {
      return;
    }

    requestAnimationFrame(() => {
      container.scrollTop = scrollEntry.scrollY ?? 0;
    });
  }, [scrollEntry?.scrollY]);

  // Build grid template rows conditionally
  const gridTemplateRows = `minmax(0, 1fr)${hasPageTool ? " auto" : ""}`;

  return (
    <Box
      style={{
        display: "grid",
        gridTemplateColumns: `${navWidth}px 1fr ${asideWidth}px`,
        gridTemplateRows,
        gridTemplateAreas: `"nav main aside"${hasPageTool ? ' "tool tool tool"' : ""}`,
        height: "100%",
        width: "100%",
        minWidth: 0,
        overflow: "hidden",
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
        px="sm"
        pt="md"
        pb="sm"
      >
        <Transition
          mounted={isNavbarOpened}
          transition="slide-right"
          duration={NAVBAR_TRANSITION_MS}
          timingFunction="ease-out"
          keepMounted
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
          data-scroll-restoration-id="renderer-main-scroll-container"
          style={{
            gridArea: "main",
            position: "relative",
            zIndex: 0,
            minWidth: 0,
            minHeight: 0,
            paddingBottom: 8,
            overflow: "auto",
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
    </Box>
  );
};
