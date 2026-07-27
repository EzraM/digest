import { useState } from "react";
import { useClipCapture } from "../../hooks/useClipCapture";
import { createInlineLinkBlock } from "../../hooks/inlineLinkInsertion";
import { NotebookAddress } from "../../domains/notebook-content/core/NotebookAddress";
import { RendererNotebookWriter } from "../../domains/notebook-content/application/RendererNotebookWriter";

type AddPageButtonProps = {
  viewId: string;
  notebookAddress: NotebookAddress;
  notebookWriter: RendererNotebookWriter;
};

export const AddPageButton = ({
  viewId,
  notebookAddress,
  notebookWriter,
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
        notebookWriter.insert(
          notebookAddress,
          [
            createInlineLinkBlock({
              url: pageInfo.url,
              title: pageInfo.title || pageInfo.url,
            }),
          ]
        )
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
