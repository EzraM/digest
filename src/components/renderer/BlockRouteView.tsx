import React, { useCallback } from "react";
import { useAppRoute } from "../../context/AppRouteContext";
import { BlockRouteViewContent } from "./BlockRouteViewContent";
import { MissingUrlView } from "./MissingUrlView";
import { CustomBlockNoteEditor } from "../../types/schema";
import { hasPreviousDigestRoute } from "./notebookReturnNavigation";
import { RendererNotebookWriter } from "../../domains/notebook-content/application/RendererNotebookWriter";
import { NotebookAddress } from "../../domains/notebook-content/core/NotebookAddress";

type BlockRouteViewProps = {
  blockId: string | undefined; // undefined for ephemeral URL routes
  docId: string | null;
  profileId: string | null;
  url: string | null;
  title: string;
  placementId: string;
  editor: CustomBlockNoteEditor;
  notebookAddress: NotebookAddress;
  notebookWriter: RendererNotebookWriter;
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
  notebookAddress,
  notebookWriter,
  onUrlChange,
}: BlockRouteViewProps) => {
  const { route, goBack, navigateToDoc } = useAppRoute();

  const handleMinimize = useCallback(() => {
    // A window opened directly on this page has no notebook route in its
    // history. In that case, use the originating document carried by the
    // route. Existing windows still go back so their scroll position restores.
    if (hasPreviousDigestRoute(window.history.state)) {
      goBack();
      return;
    }

    if (docId) {
      navigateToDoc(docId);
      return;
    }

    goBack();
  }, [docId, goBack, navigateToDoc]);

  // Type guard: ensure we're on a block or url route
  if (route.kind !== "block" && route.kind !== "url") {
    return null;
  }

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
      notebookAddress={notebookAddress}
      notebookWriter={notebookWriter}
      onUrlChange={onUrlChange}
      onBack={handleMinimize}
    />
  );
};
