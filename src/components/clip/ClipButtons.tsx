import { useContext } from "react";
import { Box, Button } from "@mantine/core";
import { ClipDraftContext } from "../../context/ClipDraftContext";
import { PageToolSlotContext } from "../../context/PageToolSlotContext";
import { useClipCapture } from "../../hooks/useClipCapture";

type ClipButtonsProps = {
  viewId?: string;
  context: "notebook" | "page";
  placement?: "floating" | "toolbar";
};

export const ClipButtons = ({
  viewId,
  context,
  placement,
}: ClipButtonsProps) => {
  const CLIP_ICON = "📎";

  const clipDraftContext = useContext(ClipDraftContext);
  const pageToolContext = useContext(PageToolSlotContext);
  const { isCapturing, captureSelection } = useClipCapture();

  const draftsCount = clipDraftContext?.drafts.length ?? 0;
  const hasPanelContent = pageToolContext?.content !== null;
  const isPanelOpen = (pageToolContext?.isVisible ?? false) && hasPanelContent;
  const hasDrafts = draftsCount > 0;

  const handleToggleDrafts = () => {
    pageToolContext?.toggleVisibility();
  };

  const handleClipAdd = async () => {
    if (viewId) {
      const result = await captureSelection(viewId);
      if (!result.success) {
        console.error("Failed to capture selection:", result.error);
      }
      // Ensure panel is open after attempting capture (drafts may be created async)
      if (!(pageToolContext?.isVisible ?? false)) {
        pageToolContext?.setVisibility(true);
      }
    }
  };

  const effectivePlacement =
    placement ?? (context === "page" ? "toolbar" : "floating");

  if (context === "notebook" && effectivePlacement === "toolbar") {
    // Notebook context rendered inline (e.g. in StatusBar)
    return (
      <Button
        size="xs"
        variant={isPanelOpen ? "filled" : "default"}
        color={isPanelOpen ? "blue" : "gray"}
        onClick={handleToggleDrafts}
        disabled={!hasDrafts}
        aria-pressed={isPanelOpen}
        style={{
          fontSize: "11px",
          height: "24px",
          padding: "0 8px",
          minWidth: "auto",
          whiteSpace: "nowrap",
          fontFamily: "monospace",
          marginLeft: "6px",
        }}
      >
        {CLIP_ICON} drafts ({draftsCount})
      </Button>
    );
  }

  if (context === "page" && effectivePlacement === "toolbar") {
    // Page context (block/fullscreen): render in toolbar chrome so it doesn't get occluded
    // by the Electron BrowserView.
    return (
      <Box style={{ display: "flex", alignItems: "center", gap: "6px" }}>
        <Button
          size="xs"
          variant="default"
          onClick={handleClipAdd}
          disabled={isCapturing || !viewId}
          style={{
            fontSize: "11px",
            height: "26px",
            padding: "0 8px",
            minWidth: "auto",
            whiteSpace: "nowrap",
            fontFamily: "monospace",
          }}
        >
          {isCapturing ? "⏳ clipping…" : `${CLIP_ICON} add`}
        </Button>
        <Button
          size="xs"
          variant={isPanelOpen ? "filled" : "default"}
          color={isPanelOpen ? "blue" : "gray"}
          onClick={handleToggleDrafts}
          disabled={!hasDrafts}
          aria-pressed={isPanelOpen}
          style={{
            fontSize: "11px",
            height: "26px",
            padding: "0 8px",
            minWidth: "auto",
            whiteSpace: "nowrap",
            fontFamily: "monospace",
          }}
        >
          {CLIP_ICON} drafts ({draftsCount})
        </Button>
      </Box>
    );
  }

  const baseLeftPx = 16;
  // In notebook context we need to clear the sidebar toggle button at the same top position.
  const notebookLeftPx = 50;

  if (context === "notebook") {
    // Notebook context: single button ":clip drafts (count)"
    return (
      <Box
        style={{
          position: "fixed",
          left: `${notebookLeftPx}px`,
          top: "25%",
          zIndex: 500,
          display: "flex",
          flexDirection: "column",
          gap: "8px",
        }}
      >
        <Button
          size="xs"
          variant={isPanelOpen ? "filled" : "default"}
          color={isPanelOpen ? "blue" : "gray"}
          onClick={handleToggleDrafts}
          disabled={!hasDrafts}
          aria-pressed={isPanelOpen}
          style={{
            fontSize: "11px",
            height: "24px",
            padding: "0 8px",
            minWidth: "auto",
            whiteSpace: "nowrap",
          }}
        >
          {CLIP_ICON} drafts ({draftsCount})
        </Button>
      </Box>
    );
  } else {
    // Page context: two buttons ":clip add" and ":clip drafts (count)"
    return (
      <Box
        style={{
          position: "fixed",
          left: `${baseLeftPx}px`,
          top: "25%",
          zIndex: 500,
          display: "flex",
          flexDirection: "column",
          gap: "8px",
        }}
      >
        <Button
          size="xs"
          variant="default"
          onClick={handleClipAdd}
          disabled={isCapturing || !viewId}
          style={{
            fontSize: "11px",
            height: "24px",
            padding: "0 8px",
            minWidth: "auto",
            whiteSpace: "nowrap",
          }}
        >
          {isCapturing ? "⏳ clipping…" : `${CLIP_ICON} add`}
        </Button>
        <Button
          size="xs"
          variant={isPanelOpen ? "filled" : "default"}
          color={isPanelOpen ? "blue" : "gray"}
          onClick={handleToggleDrafts}
          disabled={!hasDrafts}
          aria-pressed={isPanelOpen}
          style={{
            fontSize: "11px",
            height: "24px",
            padding: "0 8px",
            minWidth: "auto",
            whiteSpace: "nowrap",
          }}
        >
          {CLIP_ICON} drafts ({draftsCount})
        </Button>
      </Box>
    );
  }
};
