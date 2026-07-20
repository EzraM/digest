import {
  FormattingToolbar,
  FormattingToolbarController,
  getFormattingToolbarItems,
  SuggestionMenuController,
  SuggestionMenuProps,
  useBlockNoteEditor,
  useComponentsContext,
  useSelectedBlocks,
} from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import React, { useCallback, useMemo, useState } from "react";
import { CustomBlockNoteEditor } from "../../types/schema";
import { SlashCommandOption } from "../../types/slashCommand";
import { useEditorScrollIntoView } from "../../hooks/useEditorScrollIntoView";
import { BlockNotificationContainer } from "./BlockNotificationContainer";

type EditorPaneProps = {
  editor: CustomBlockNoteEditor;
  SlashCommandSyncMenu: React.FC<SuggestionMenuProps<SlashCommandOption>>;
  onSlashMenuItems: (query: string) => Promise<SlashCommandOption[]>;
  onSlashMenuItemClick: (item: SlashCommandOption) => void;
  focusBlockId?: string | null;
};

export const EditorPane = ({
  editor,
  SlashCommandSyncMenu,
  onSlashMenuItems,
  onSlashMenuItemClick,
  focusBlockId,
}: EditorPaneProps) => {
  useEditorScrollIntoView(focusBlockId, editor);

  // Note: We don't check editor.view availability here because BlockNoteView
  // creates the view when it mounts. The check would prevent initial render.
  // Instead, we rely on error boundaries and guards in child components
  // (like BlockNotificationContainer) that access the editor during render.

  return (
    <div className="App">
      <EditorErrorBoundary>
        <BlockNoteView
          editor={editor}
          slashMenu={false}
          formattingToolbar={false}
        >
          <FormattingToolbarController
            formattingToolbar={NotebookFormattingToolbar}
          />
          <SuggestionMenuController
            triggerCharacter={"/"}
            suggestionMenuComponent={SlashCommandSyncMenu}
            getItems={onSlashMenuItems}
            onItemClick={onSlashMenuItemClick}
          />
        </BlockNoteView>
        <div style={{ height: "2000px", width: "100%", color: "gray" }} />
      </EditorErrorBoundary>
      <BlockNotificationContainer editor={editor} />
    </div>
  );
};

const NotebookFormattingToolbar = () => {
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

class EditorErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; retryKey: number }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, retryKey: 0 };
  }

  static getDerivedStateFromError() {
    return { hasError: true, retryKey: 0 };
  }

  handleRetry = () => {
    this.setState((prev) => ({
      hasError: false,
      retryKey: prev.retryKey + 1,
    }));
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            padding: "12px",
            border: "1px solid #ffd43b",
            borderRadius: "8px",
            background: "#fff9db",
            color: "#8f6400",
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: "8px" }}>
            Editor hit an error
          </div>
          <div style={{ fontSize: "13px", marginBottom: "8px" }}>
            Try again to continue editing.
          </div>
          <button
            type="button"
            onClick={this.handleRetry}
            style={{
              border: "1px solid #d0a700",
              background: "#fff",
              color: "#8f6400",
              borderRadius: "6px",
              padding: "6px 10px",
              cursor: "pointer",
              fontSize: "13px",
            }}
          >
            Retry
          </button>
        </div>
      );
    }

    return (
      <React.Fragment key={this.state.retryKey}>
        {this.props.children}
      </React.Fragment>
    );
  }
}
