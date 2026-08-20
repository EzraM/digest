import { forwardRef, useRef } from "react";
import { useClipCapture } from "../../hooks/useClipCapture";

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

export type PageBookmarkCandidate = {
  url: string;
  pageTitle: string;
};

type AddPageButtonProps = {
  viewId: string;
  disabled?: boolean;
  busy?: boolean;
  filled?: boolean;
  className?: string;
  onPageBookmark: (candidate: PageBookmarkCandidate) => void;
  onSelectionAdded: () => void;
  onInteractionStart?: () => void;
  onInteractionEnd?: () => void;
};

export const AddPageButton = forwardRef<HTMLButtonElement, AddPageButtonProps>(({
  viewId,
  disabled = false,
  busy = false,
  filled = false,
  className,
  onPageBookmark,
  onSelectionAdded,
  onInteractionStart,
  onInteractionEnd,
}, ref) => {
  const { isCapturing, captureSelection } = useClipCapture();
  const requestInFlightRef = useRef(false);

  const handleAdd = async () => {
    if (requestInFlightRef.current || disabled) return;
    requestInFlightRef.current = true;

    try {
      const result = await captureSelection(viewId);

      if (result.success) {
        console.info("[AddPageButton] Added current selection to notebook");
        onSelectionAdded();
        return;
      }

      if (result.error === "No selection found") {
        const pageInfo = await window.electronAPI.browser.getPageInfo(viewId);
        if (pageInfo.success) {
          onPageBookmark({
            url: pageInfo.url,
            pageTitle: pageInfo.title || pageInfo.url,
          });
          return;
        }

        console.error("[AddPageButton] Failed to read current page", { pageInfo });
        return;
      }

      console.error("[AddPageButton] Failed to add page:", result.error);
    } finally {
      requestInFlightRef.current = false;
    }
  };

  const isBusy = busy || isCapturing;

  return (
    <button
      ref={ref}
      className={className}
      type="button"
      onClick={handleAdd}
      onMouseEnter={onInteractionStart}
      onMouseLeave={onInteractionEnd}
      onFocus={onInteractionStart}
      onBlur={onInteractionEnd}
      disabled={disabled || isBusy}
      title="Add current page to notebook"
      aria-label="Add current page to notebook"
    >
      {isBusy ? <span aria-hidden="true">…</span> : <BookmarkIcon filled={filled} />}
    </button>
  );
});

AddPageButton.displayName = "AddPageButton";
