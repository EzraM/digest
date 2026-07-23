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
  placementId: string;
  editor: CustomBlockNoteEditor;
  onUrlChange?: (url: string) => void;
};

export const BlockRouteView = ({
  blockId,
  docId,
  profileId,
  url,
  title,
  placementId,
  editor,
  onUrlChange,
}: BlockRouteViewProps) => {
  const { route, goBack } = useAppRoute();

  // Type guard: ensure we're on a block or url route
  if (route.kind !== "block" && route.kind !== "url") {
    return null;
  }

  // Use history.back() to trigger scroll restoration
  const handleMinimize = goBack;

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
      placementId={placementId}
      editor={editor}
      onUrlChange={onUrlChange}
      onBack={handleMinimize}
    />
  );
};
