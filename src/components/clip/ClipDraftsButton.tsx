import { useContext } from "react";
import { Button } from "@mantine/core";
import { ClipDraftContext } from "../../context/ClipDraftContext";
import { PageToolSlotContext } from "../../context/PageToolSlotContext";

export const ClipDraftsButton = () => {
  const clipDraftContext = useContext(ClipDraftContext);
  const pageToolContext = useContext(PageToolSlotContext);

  const draftsCount = clipDraftContext?.drafts.length ?? 0;
  const hasDrafts = draftsCount > 0;
  const isPanelOpen =
    (pageToolContext?.isVisible ?? false) &&
    pageToolContext?.content !== null;

  return (
    <Button
      size="xs"
      variant={isPanelOpen ? "filled" : "default"}
      color={isPanelOpen ? "blue" : "gray"}
      onClick={() => pageToolContext?.toggleVisibility()}
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
      📎 drafts ({draftsCount})
    </Button>
  );
};
