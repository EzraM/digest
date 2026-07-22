import {
  FormattingToolbar,
  getFormattingToolbarItems,
  useBlockNoteEditor,
  useComponentsContext,
  useSelectedBlocks,
} from "@blocknote/react";
import { useCallback, useMemo, useState } from "react";

export const NotebookFormattingToolbar = () => {
  const items = getFormattingToolbarItems();
  const downloadButtonIndex = items.findIndex(
    (item) => item.key === "fileDownloadButton"
  );

  items.splice(
    downloadButtonIndex === -1 ? 0 : downloadButtonIndex + 1,
    0,
    <CopyImageButton key="copyImageButton" />
  );

  return <FormattingToolbar>{items}</FormattingToolbar>;
};

const CopyImageButton = () => {
  const editor = useBlockNoteEditor();
  const components = useComponentsContext();
  const selectedBlocks = useSelectedBlocks(editor);
  const [copied, setCopied] = useState(false);

  const imageBlock = useMemo(() => {
    if (selectedBlocks.length !== 1) return undefined;
    const block = selectedBlocks[0];
    if (
      block.type !== "image" ||
      !("url" in block.props) ||
      typeof block.props.url !== "string" ||
      block.props.url === ""
    ) {
      return undefined;
    }
    return block;
  }, [selectedBlocks]);

  const copyImage = useCallback(async () => {
    if (!imageBlock || typeof imageBlock.props.url !== "string") return;

    try {
      const response = await fetch(imageBlock.props.url);
      if (!response.ok) {
        throw new Error(`Could not load image (${response.status})`);
      }

      const imageData = await response.arrayBuffer();
      window.electronAPI.clipboard.writeImage(imageData);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch (error) {
      console.error("Failed to copy image to clipboard:", error);
    } finally {
      editor.focus();
    }
  }, [editor, imageBlock]);

  if (!components || !imageBlock || !editor.isEditable) return null;

  return (
    <components.FormattingToolbar.Button
      className="bn-button"
      label={copied ? "Copied image" : "Copy image"}
      mainTooltip={copied ? "Copied image" : "Copy image"}
      icon={copied ? <CheckIcon /> : <CopyIcon />}
      onClick={copyImage}
    />
  );
};

const CopyIcon = () => (
  <svg
    aria-hidden="true"
    fill="none"
    height="18"
    viewBox="0 0 24 24"
    width="18"
  >
    <rect
      height="13"
      rx="2"
      stroke="currentColor"
      strokeWidth="2"
      width="13"
      x="8"
      y="8"
    />
    <path
      d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="2"
    />
  </svg>
);

const CheckIcon = () => (
  <svg
    aria-hidden="true"
    fill="none"
    height="18"
    viewBox="0 0 24 24"
    width="18"
  >
    <path
      d="m5 12 4 4L19 6"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
    />
  </svg>
);
