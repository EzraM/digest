import { useState } from "react";
import { useClipCapture } from "../../hooks/useClipCapture";
import { createInlineLinkBlock } from "../../hooks/inlineLinkInsertion";
import { NotebookAddress } from "../../domains/notebook-content/core/NotebookAddress";
import { NotebookWriteClient } from "../../domains/notebook-content/application/NotebookWriteClient";

const BookmarkIcon = ({ filled }: { filled: boolean }) => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path
      d="M4.25 2.25h7.5v11.5L8 11.15l-3.75 2.6V2.25Z"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.35"
      strokeLinejoin="round"
    />
  </svg>
);

type AddPageButtonProps = {
  viewId: string;
  notebookAddress: NotebookAddress;
  notebookWriter: NotebookWriteClient;
  className?: string;
  onInteractionStart?: () => void;
  onInteractionEnd?: () => void;
};

export const AddPageButton = ({
  viewId,
  notebookAddress,
  notebookWriter,
  className,
  onInteractionStart,
  onInteractionEnd,
}: AddPageButtonProps) => {
  const { isCapturing, captureSelection } = useClipCapture();
  const [didAddPage, setDidAddPage] = useState(false);

  const handleAdd = async () => {
    const result = await captureSelection(viewId);

    if (result.success) {
      console.info("[AddPageButton] Added current selection to notebook");
      setDidAddPage(true);
      window.setTimeout(() => setDidAddPage(false), 1500);
      return;
    }

    if (result.error === "No selection found") {
      const pageInfo = await window.electronAPI.browser.getPageInfo(viewId);
      if (
        pageInfo.success &&
        (await notebookWriter.insert(
          notebookAddress,
          [
            createInlineLinkBlock({
              url: pageInfo.url,
              title: pageInfo.title || pageInfo.url,
            }),
          ],
          {
            source: "page-link",
            sourceUrl: pageInfo.url,
            capturedAt: Date.now(),
          }
        )).status !== "rejected"
      ) {
        console.info("[AddPageButton] Added current page link to notebook", {
          url: pageInfo.url,
          notebookAddress,
        });
        setDidAddPage(true);
        window.setTimeout(() => setDidAddPage(false), 1500);
        return;
      }

      console.error("[AddPageButton] Failed to add current page link", {
        pageInfo,
        notebookAddress,
      });
      return;
    }

    console.error("[AddPageButton] Failed to add page:", result.error);
  };

  return (
    <button
      className={className}
      type="button"
      onClick={handleAdd}
      onMouseEnter={onInteractionStart}
      onMouseLeave={onInteractionEnd}
      onFocus={onInteractionStart}
      onBlur={onInteractionEnd}
      disabled={isCapturing}
      title="Add current page to notebook"
      aria-label="Add current page to notebook"
    >
      {isCapturing ? <span aria-hidden="true">…</span> : <BookmarkIcon filled={didAddPage} />}
    </button>
  );
};
