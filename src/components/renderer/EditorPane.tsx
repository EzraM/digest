import {
  SuggestionMenuController,
  SuggestionMenuProps,
} from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import React from "react";
import { CustomBlockNoteEditor } from "../../types/schema";
import { SlashCommandOption } from "../../types/slashCommand";
import { useEditorScrollIntoView } from "../../hooks/useEditorScrollIntoView";

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

  return (
    <div className="App">
      <BlockNoteView editor={editor} slashMenu={false}>
        <SuggestionMenuController
          triggerCharacter={"/"}
          suggestionMenuComponent={SlashCommandSyncMenu}
          getItems={onSlashMenuItems}
          onItemClick={onSlashMenuItemClick}
        />
      </BlockNoteView>
      <div style={{ height: "2000px", width: "100%", color: "gray" }} />
    </div>
  );
};
