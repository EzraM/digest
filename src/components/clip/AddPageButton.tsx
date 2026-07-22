import { useState } from "react";
import { useClipCapture } from "../../hooks/useClipCapture";
import { insertInlineLinkAtCurrentCursor } from "../../hooks/useRendererEditor";

type AddPageButtonProps = {
  viewId: string;
};

export const AddPageButton = ({ viewId }: AddPageButtonProps) => {
  const { isCapturing, captureSelection } = useClipCapture();
  const [didAddPage, setDidAddPage] = useState(false);

  const handleAdd = async () => {
    const result = await captureSelection(viewId);

    if (result.success) {
      setDidAddPage(true);
      window.setTimeout(() => setDidAddPage(false), 1500);
      return;
    }

    if (result.error === "No selection found") {
      const pageInfo = await window.electronAPI.browser.getPageInfo(viewId);
      if (
        pageInfo.success &&
        insertInlineLinkAtCurrentCursor(
          pageInfo.url,
          pageInfo.title || pageInfo.url
        )
      ) {
        setDidAddPage(true);
        window.setTimeout(() => setDidAddPage(false), 1500);
        return;
      }
    }

    console.error("Failed to add page:", result.error);
  };

  return (
    <button
      className="left-rail__add"
      type="button"
      onClick={handleAdd}
      disabled={isCapturing}
      title="Add current page to notebook"
      aria-label="Add current page to notebook"
    >
      <span aria-hidden="true">
        {isCapturing ? "…" : didAddPage ? "✓" : "+"}
      </span>
    </button>
  );
};
