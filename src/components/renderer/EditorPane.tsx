import {
  SuggestionMenuController,
  SuggestionMenuProps,
} from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import React from "react";
import { DebugToggle } from "../DebugToggle";
import { CustomBlockNoteEditor } from "../../types/schema";
import { SlashCommandOption } from "../../types/slashCommand";

type EditorPaneProps = {
  editor: CustomBlockNoteEditor;
  SlashCommandSyncMenu: React.FC<SuggestionMenuProps<SlashCommandOption>>;
  onSlashMenuItems: (query: string) => Promise<SlashCommandOption[]>;
  onSlashMenuItemClick: (item: SlashCommandOption) => void;
  onDebugToggle: (enabled: boolean) => void;
};

export const EditorPane = ({
  editor,
  SlashCommandSyncMenu,
  onSlashMenuItems,
  onSlashMenuItemClick,
  onDebugToggle,
}: EditorPaneProps) => (
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
    <DebugToggle onToggle={onDebugToggle} />
  </div>
);
