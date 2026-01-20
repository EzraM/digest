import React from "react";
import { CustomBlockNoteEditor } from "../../types/schema";
import { BlockNotificationContainer } from "./BlockNotificationContainer";

type BlockRouteNotificationsRowProps = {
  editor: CustomBlockNoteEditor;
  isVisible: boolean;
};

export const BlockRouteNotificationsRow = ({
  editor,
  isVisible,
}: BlockRouteNotificationsRowProps) => {
  if (!isVisible) {
    return null;
  }

  return (
    <div
      style={{
        backgroundColor: "#fff",
        borderTop: "1px solid #e0e0e0",
        padding: "6px",
      }}
    >
      <BlockNotificationContainer editor={editor} placement="inline" />
    </div>
  );
};
