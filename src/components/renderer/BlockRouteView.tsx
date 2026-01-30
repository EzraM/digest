import React from "react";
import { useAppRoute } from "../../context/AppRouteContext";
import { BlockRouteViewContent } from "./BlockRouteViewContent";
import { MissingUrlView } from "./MissingUrlView";
import { CustomBlockNoteEditor } from "../../types/schema";

type BlockRouteViewProps = {
  blockId: string | undefined; // undefined for ephemeral URL routes
  docId: string | null;
  profileId: string | null;
  url: string | null;
  title: string;
  viewId: string;
  editor: CustomBlockNoteEditor;
  onUrlChange?: (url: string) => void;
  onReady?: (viewId: string) => void;
};

export const BlockRouteView = ({
  blockId,
  docId,
  profileId,
  url,
  title,
  viewId,
  editor,
  onUrlChange,
  onReady,
}: BlockRouteViewProps) => {
  const { route, navigateToDoc } = useAppRoute();

  // Type guard: ensure we're on a block or url route
  if (route.kind !== "block" && route.kind !== "url") {
    return null;
  }

  const handleMinimize = () => {
    if (docId) {
      navigateToDoc(docId, blockId ?? null);
    } else {
      window.history.back();
    }
  };

  if (!url) {
    return <MissingUrlView title={title} onBack={handleMinimize} />;
  }

  return (
    <BlockRouteViewContent
      blockId={blockId}
      docId={docId}
      profileId={profileId}
      url={url}
      title={title}
      viewId={viewId}
      editor={editor}
      onUrlChange={onUrlChange}
      onReady={onReady}
      onBack={handleMinimize}
    />
  );
};
