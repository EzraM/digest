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

/**
 * Hook that keeps track of browser navigation state for a site block.
 * It listens to navigation events from the main process and ensures the
 * block's stored URL stays in sync with the live browser view.
 */
export function useBrowserNavigationState(
  blockId: string,
  editor: CustomBlockNoteEditor | undefined,
  initialUrl: string
): NavigationState {
  const [canGoBack, setCanGoBack] = useState(false);
  const [isNavigatingBack, setIsNavigatingBack] = useState(false);

  // Keep the block's stored URL in sync when navigation updates are received
  useEffect(() => {
    if (!window.electronAPI?.onBrowserNavigation) {
      return;
    }

    let isMounted = true;

    const unsubscribe = window.electronAPI.onBrowserNavigation(
      (event: NavigationUpdateEvent) => {
        if (!isMounted || event.blockId !== blockId) {
          return;
        }

        setCanGoBack(Boolean(event.canGoBack));
        setIsNavigatingBack(false);

        if (!editor) {
          return;
        }

        const block = editor.getBlock(blockId);
        if (!block || block.type !== "site") {
          return;
        }

        const currentUrl = (block.props as { url?: string } | undefined)?.url ?? "";
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
  }, [blockId, editor]);

  // Keep the stored URL aligned with the initial prop when the hook mounts
  useEffect(() => {
    if (!editor) {
      return;
    }

    const block = editor.getBlock(blockId);
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
  }, [blockId, editor, initialUrl]);

  const handleGoBack = useCallback(async () => {
    const browserApi = window.electronAPI?.browser;
    if (!browserApi || isNavigatingBack) {
      return;
    }

    setIsNavigatingBack(true);

    try {
      const result = await browserApi.goBack(blockId);
      if (!result?.success && result?.canGoBack === false) {
        setCanGoBack(false);
        setIsNavigatingBack(false);
      }
    } catch (error) {
      console.error(`Failed to navigate back for block ${blockId}:`, error);
      setIsNavigatingBack(false);
    }
  }, [blockId, isNavigatingBack]);

  return {
    canGoBack,
    isNavigatingBack,
    goBack: handleGoBack,
  };
}
