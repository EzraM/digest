import {
  SuggestionMenuController,
  SuggestionMenuProps,
} from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import React from "react";
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
  useEditorScrollIntoView(focusBlockId);

  // Note: We don't check editor.view availability here because BlockNoteView
  // creates the view when it mounts. The check would prevent initial render.
  // Instead, we rely on error boundaries and guards in child components
  // (like BlockNotificationContainer) that access the editor during render.

  return (
    <div className="App">
      <EditorErrorBoundary>
        <BlockNoteView editor={editor} slashMenu={false}>
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
