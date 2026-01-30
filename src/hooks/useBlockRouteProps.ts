import { useCallback, useEffect, useReducer, useRef } from "react";
import { CustomBlockNoteEditor } from "../types/schema";

export type BlockRouteProps = {
  blockId: string;
  docId: string | null;
  url: string | null;
  title: string;
  type: "site" | "other";
};

type State = {
  props: BlockRouteProps | null;
  cache: Record<string, BlockRouteProps>;
};

type Action =
  | { type: "PROPS_RESOLVED"; props: BlockRouteProps }
  | { type: "UPDATE_URL"; blockId: string; url: string }
  | { type: "CLEAR"; blockId: string };

const arePropsEqual = (
  a: BlockRouteProps | null,
  b: BlockRouteProps | null
): boolean => {
  if (!a || !b) return false;
  return (
    a.blockId === b.blockId &&
    a.docId === b.docId &&
    a.url === b.url &&
    a.title === b.title &&
    a.type === b.type
  );
};

const buildProps = (
  editor: CustomBlockNoteEditor,
  blockId: string,
  docId: string | null,
  cached?: BlockRouteProps
): BlockRouteProps => {
  const baseProps: BlockRouteProps = {
    blockId,
    docId,
    url: null,
    title: "Block",
    type: "other",
  };

  try {
    const block = editor.getBlock(blockId);
    if (!block || block.type !== "site") {
      return cached && cached.type === "other" ? cached : baseProps;
    }

    const url = (block.props as { url?: string } | undefined)?.url ?? "";
    return {
      blockId,
      docId,
      url: url || null,
      title: "Site",
      type: "site",
    };
  } catch {
    return cached ?? baseProps;
  }
};

const reducer = (state: State, action: Action): State => {
  switch (action.type) {
    case "PROPS_RESOLVED": {
      const cached = state.cache[action.props.blockId];
      if (arePropsEqual(cached ?? null, action.props)) {
        if (arePropsEqual(state.props, action.props)) {
          return state;
        }
      }
      return {
        props: action.props,
        cache: {
          ...state.cache,
          [action.props.blockId]: action.props,
        },
      };
    }
    case "UPDATE_URL": {
      const existing =
        state.cache[action.blockId] ??
        (state.props?.blockId === action.blockId ? state.props : null);

      if (!existing || existing.url === action.url) {
        return state;
      }

      const updated: BlockRouteProps = {
        ...existing,
        url: action.url,
      };

      const isActive = state.props?.blockId === action.blockId;

      return {
        props: isActive ? updated : state.props,
        cache: {
          ...state.cache,
          [action.blockId]: updated,
        },
      };
    }
    case "CLEAR": {
      if (state.props?.blockId !== action.blockId) {
        return state;
      }
      return {
        ...state,
        props: null,
      };
    }
    default:
      return state;
  }
};

/**
 * Hook to manage block route props (metadata) for block routes.
 * Extracts and caches block information from the editor.
 */
export function useBlockRouteProps(
  blockId: string | undefined,
  docId: string | null,
  editor: CustomBlockNoteEditor
) {
  const [state, dispatch] = useReducer(reducer, { props: null, cache: {} });
  const prevBlockIdRef = useRef<string | undefined>(undefined);

  // Resolve props when blockId changes
  useEffect(() => {
    if (!blockId) {
      if (prevBlockIdRef.current) {
        dispatch({ type: "CLEAR", blockId: prevBlockIdRef.current });
      }
      prevBlockIdRef.current = undefined;
      return;
    }

    prevBlockIdRef.current = blockId;

    let isCancelled = false;
    const cached = state.cache[blockId];

    const rafId = requestAnimationFrame(() => {
      if (isCancelled) return;
      const props = buildProps(editor, blockId, docId, cached);
      dispatch({ type: "PROPS_RESOLVED", props });
    });

    return () => {
      isCancelled = true;
      cancelAnimationFrame(rafId);
    };
  }, [blockId, docId, editor, state.cache]);

  const updateUrl = useCallback((blockId: string, url: string) => {
    dispatch({ type: "UPDATE_URL", blockId, url });
  }, []);

  return {
    blockRouteProps: blockId ? state.props : null,
    updateCachedBlockUrl: updateUrl,
  };
}
