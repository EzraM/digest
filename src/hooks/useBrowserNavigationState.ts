import { useCallback, useEffect, useState } from "react";
import type {
  CustomBlockNoteEditor,
  CustomPartialBlock,
} from "../types/schema";

interface NavigationUpdateEvent {
  blockId: string;
  url: string;
  canGoBack?: boolean;
}

interface NavigationState {
  canGoBack: boolean;
  isNavigatingBack: boolean;
  goBack: () => void;
}

type NavigationOptions = {
  editor?: CustomBlockNoteEditor;
  blockIdForEditorSync?: string;
  onUrlChange?: (url: string) => void;
};

/**
 * Hook that keeps track of browser navigation state for a browser view.
 * It listens to navigation events from the main process and can optionally
 * sync URL updates back to the editor or a caller-provided callback.
 */
export function useBrowserNavigationState(
  viewId: string,
  initialUrl: string,
  options?: NavigationOptions
): NavigationState {
  const [canGoBack, setCanGoBack] = useState(false);
  const [isNavigatingBack, setIsNavigatingBack] = useState(false);
  const { editor, blockIdForEditorSync = viewId, onUrlChange } = options ?? {};

  // Keep the block's stored URL in sync when navigation updates are received
  useEffect(() => {
    if (!window.electronAPI?.onBrowserNavigation) {
      return;
    }

    let isMounted = true;

    const unsubscribe = window.electronAPI.onBrowserNavigation(
      (event: NavigationUpdateEvent) => {
        const eventMatches =
          event.blockId === viewId ||
          (!!blockIdForEditorSync && event.blockId === blockIdForEditorSync);

        if (!isMounted || !eventMatches) {
          return;
        }

        setCanGoBack(Boolean(event.canGoBack));
        setIsNavigatingBack(false);

        if (options?.onUrlChange && event.url) {
          options.onUrlChange(event.url);
        }

        if (!editor) {
          return;
        }

        const block = editor.getBlock(blockIdForEditorSync);
        if (!block || block.type !== "site") {
          return;
        }

        const currentUrl =
          (block.props as { url?: string } | undefined)?.url ?? "";

        if (event.url && event.url !== currentUrl) {
          editor.updateBlock(block, {
            props: {
              ...block.props,
              url: event.url,
            },
          } as CustomPartialBlock);
        }
      }
    );

    return () => {
      isMounted = false;
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [blockIdForEditorSync, editor, onUrlChange, viewId]);

  // Keep the stored URL aligned with the initial prop when the hook mounts
  useEffect(() => {
    if (!editor) {
      return;
    }

    const block = editor.getBlock(blockIdForEditorSync);
    if (!block || block.type !== "site") {
      return;
    }

    const currentUrl = (block.props as { url?: string } | undefined)?.url ?? "";
    if (initialUrl && currentUrl !== initialUrl) {
      editor.updateBlock(block, {
        props: {
          ...block.props,
          url: initialUrl,
        },
      } as CustomPartialBlock);
    }
  }, [blockIdForEditorSync, editor, initialUrl]);

  const handleGoBack = useCallback(async () => {
    const browserApi = window.electronAPI?.browser;
    if (!browserApi || isNavigatingBack) {
      return;
    }

    setIsNavigatingBack(true);

    try {
      const result = await browserApi.goBack(viewId);
      if (!result?.success && result?.canGoBack === false) {
        setCanGoBack(false);
        setIsNavigatingBack(false);
      }
    } catch (error) {
      console.error(`Failed to navigate back for view ${viewId}:`, error);
      setIsNavigatingBack(false);
    }
  }, [isNavigatingBack, viewId]);

  return {
    canGoBack,
    isNavigatingBack,
    goBack: handleGoBack,
  };
}
