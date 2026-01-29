import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from "react";
import { CustomBlockNoteEditor } from "../types/schema";

export type RendererRoute =
  | { kind: "doc"; docId: string | null; focusBlockId?: string | null }
  | { kind: "block"; blockId: string; docId?: string | null }
  | { kind: "url"; url: string; docId?: string | null };

export type BlockRouteProps = {
  blockId: string;
  docId: string | null;
  url: string | null;
  title: string;
  type: "site" | "other";
};

type RouterState = {
  route: RendererRoute;
  blockRouteProps: BlockRouteProps | null;
  cache: Record<string, BlockRouteProps>;
};

type RouterAction =
  | { type: "ROUTE_CHANGED"; route: RendererRoute }
  | { type: "BLOCK_ROUTE_PROPS_RESOLVED"; props: BlockRouteProps }
  | { type: "UPDATE_BLOCK_URL"; blockId: string; url: string };

export type RouterHelpers =
  | {
      route: {
        kind: "doc";
        docId: string | null;
        focusBlockId?: string | null;
      };
      blockRouteProps: null;
      navigateToDoc: (docId: string, focusBlockId?: string | null) => void;
      navigateToBlock: (blockId: string, docId?: string | null) => void;
      navigateToUrl: (url: string, docId?: string | null) => void;
      updateCachedBlockUrl: (blockId: string, url: string) => void;
    }
  | {
      route: { kind: "block"; blockId: string; docId?: string | null };
      blockRouteProps: BlockRouteProps | null;
      navigateToDoc: (docId: string, focusBlockId?: string | null) => void;
      navigateToBlock: (blockId: string, docId?: string | null) => void;
      navigateToUrl: (url: string, docId?: string | null) => void;
      updateCachedBlockUrl: (blockId: string, url: string) => void;
    }
  | {
      route: { kind: "url"; url: string; docId?: string | null };
      blockRouteProps: null;
      navigateToDoc: (docId: string, focusBlockId?: string | null) => void;
      navigateToBlock: (blockId: string, docId?: string | null) => void;
      navigateToUrl: (url: string, docId?: string | null) => void;
      updateCachedBlockUrl: (blockId: string, url: string) => void;
    };

const normalizePath = (hash: string) => {
  const trimmed = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!trimmed.startsWith("/")) {
    return `/${trimmed}`;
  }
  return trimmed;
};

const buildDocPath = (docId: string, focusBlockId?: string | null) => {
  const query = focusBlockId
    ? `?focus=${encodeURIComponent(focusBlockId)}`
    : "";
  return `/doc/${encodeURIComponent(docId)}${query}`;
};

const buildBlockPath = (blockId: string, docId?: string | null) => {
  const query = docId ? `?doc=${encodeURIComponent(docId)}` : "";
  return `/block/${encodeURIComponent(blockId)}${query}`;
};

const buildUrlPath = (url: string, docId?: string | null) => {
  const query = docId ? `?doc=${encodeURIComponent(docId)}` : "";
  return `/url/${encodeURIComponent(url)}${query}`;
};

const parseRoute = (
  hash: string,
  fallbackDocId: string | null
): RendererRoute => {
  const path = normalizePath(hash || "");

  // Use URL to handle query parsing reliably
  const url = new URL(path || "/", "https://local");
  const segments = url.pathname.split("/").filter(Boolean);

  if (segments[0] === "block" && segments[1]) {
    const blockId = decodeURIComponent(segments[1]);
    const docIdParam = url.searchParams.get("doc");
    return {
      kind: "block",
      blockId,
      docId: docIdParam ? decodeURIComponent(docIdParam) : fallbackDocId,
    };
  }

  if (segments[0] === "url" && segments[1]) {
    const urlParam = decodeURIComponent(segments[1]);
    const docIdParam = url.searchParams.get("doc");
    return {
      kind: "url",
      url: urlParam,
      docId: docIdParam ? decodeURIComponent(docIdParam) : fallbackDocId,
    };
  }

  if (segments[0] === "doc" && segments[1]) {
    const docId = decodeURIComponent(segments[1]);
    const focusBlockId = url.searchParams.get("focus");
    return {
      kind: "doc",
      docId,
      focusBlockId: focusBlockId ? decodeURIComponent(focusBlockId) : null,
    };
  }

  // Default to doc route with fallback
  return { kind: "doc", docId: fallbackDocId ?? null, focusBlockId: null };
};

const areBlockRoutePropsEqual = (
  a: BlockRouteProps | null,
  b: BlockRouteProps | null
) => {
  if (!a || !b) return false;
  return (
    a.blockId === b.blockId &&
    a.docId === b.docId &&
    a.url === b.url &&
    a.title === b.title &&
    a.type === b.type
  );
};

const buildBlockRouteProps = (
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
  } catch (error) {
    return cached ?? baseProps;
  }
};

// Reducer for router state
const routerReducer = (
  state: RouterState,
  action: RouterAction
): RouterState => {
  switch (action.type) {
    case "ROUTE_CHANGED": {
      const cached =
        action.route.kind === "block"
          ? state.cache[action.route.blockId] ?? null
          : null;
      return {
        ...state,
        route: action.route,
        // Only block routes have blockRouteProps, url routes don't need them
        blockRouteProps: action.route.kind === "block" ? cached : null,
      };
    }
    case "BLOCK_ROUTE_PROPS_RESOLVED": {
      const cached = state.cache[action.props.blockId];
      const nextBlockRouteProps = action.props;

      if (areBlockRoutePropsEqual(cached ?? null, nextBlockRouteProps)) {
        if (areBlockRoutePropsEqual(state.blockRouteProps, nextBlockRouteProps)) {
          return state;
        }
      }

      return {
        ...state,
        blockRouteProps: nextBlockRouteProps,
        cache: {
          ...state.cache,
          [nextBlockRouteProps.blockId]: nextBlockRouteProps,
        },
      };
    }
    case "UPDATE_BLOCK_URL": {
      const existing =
        state.cache[action.blockId] ??
        (state.blockRouteProps?.blockId === action.blockId
          ? state.blockRouteProps
          : null);

      if (!existing) {
        return state;
      }

      if (existing.url === action.url) {
        return state;
      }

      const updated: BlockRouteProps = {
        ...existing,
        url: action.url,
      };

      const isActiveBlock =
        state.route.kind === "block" && state.route.blockId === action.blockId;

      return {
        ...state,
        blockRouteProps: isActiveBlock ? updated : state.blockRouteProps,
        cache: {
          ...state.cache,
          [action.blockId]: updated,
        },
      };
    }
    default:
      return state;
  }
};

const createInitialState = (fallbackDocId: string | null): RouterState => {
  const route = parseRoute(window.location.hash, fallbackDocId);
  return {
    route,
    blockRouteProps: null,
    cache: {},
  };
};

export const useRendererRouter = (
  fallbackDocId: string | null,
  activeDocumentId: string | null,
  editor: CustomBlockNoteEditor
): RouterHelpers => {
  const [state, dispatch] = useReducer(
    routerReducer,
    fallbackDocId,
    createInitialState
  );
  const lastSwitchedDocRef = useRef<string | null>(null);

  // Keep route in sync with hash changes
  useEffect(() => {
    const handleHashChange = () => {
      const newRoute = parseRoute(window.location.hash, fallbackDocId);
      dispatch({ type: "ROUTE_CHANGED", route: newRoute });
    };

    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, [fallbackDocId]);

  // Ensure we have a default doc route when the doc id becomes known
  useEffect(() => {
    if (state.route.kind === "doc" && !state.route.docId && fallbackDocId) {
      const targetHash = `#${buildDocPath(fallbackDocId)}`;
      window.location.hash = targetHash;
      dispatch({
        type: "ROUTE_CHANGED",
        route: { kind: "doc", docId: fallbackDocId, focusBlockId: null },
      });
    }

    if (!window.location.hash && fallbackDocId) {
      window.location.hash = `#${buildDocPath(fallbackDocId)}`;
    }
  }, [fallbackDocId, state.route]);

  // Keep Electron's active document in sync with route doc id
  useEffect(() => {
    if (!window.electronAPI?.documents?.switch) {
      return;
    }

    const targetDocId =
      state.route.kind === "doc"
        ? state.route.docId
        : state.route.kind === "url"
        ? (state.route.docId ?? fallbackDocId ?? activeDocumentId)
        : (state.route.docId ?? fallbackDocId ?? activeDocumentId);

    if (!targetDocId) {
      return;
    }

    if (
      targetDocId === activeDocumentId ||
      targetDocId === lastSwitchedDocRef.current
    ) {
      return;
    }

    window.electronAPI.documents.switch(targetDocId).catch(() => {
      // Ignore errors; renderer state will stay as-is
    });
    lastSwitchedDocRef.current = targetDocId;
  }, [state.route, fallbackDocId, activeDocumentId]);

  const navigateToDoc = useCallback(
    (docId: string, focusBlockId?: string | null) => {
      const target = `#${buildDocPath(docId, focusBlockId)}`;
      if (window.location.hash === target) {
        startTransition(() => {
          dispatch({
            type: "ROUTE_CHANGED",
            route: { kind: "doc", docId, focusBlockId: focusBlockId ?? null },
          });
        });
      } else {
        window.location.hash = target;
      }
    },
    []
  );

  const navigateToBlock = useCallback(
    (blockId: string, docId?: string | null) => {
      const target = `#${buildBlockPath(
        blockId,
        docId ?? fallbackDocId ?? undefined
      )}`;
      if (window.location.hash === target) {
        startTransition(() => {
          dispatch({
            type: "ROUTE_CHANGED",
            route: { kind: "block", blockId, docId: docId ?? fallbackDocId },
          });
        });
      } else {
        window.location.hash = target;
      }
    },
    [fallbackDocId]
  );

  const navigateToUrl = useCallback(
    (url: string, docId?: string | null) => {
      const target = `#${buildUrlPath(
        url,
        docId ?? fallbackDocId ?? undefined
      )}`;
      if (window.location.hash === target) {
        startTransition(() => {
          dispatch({
            type: "ROUTE_CHANGED",
            route: { kind: "url", url, docId: docId ?? fallbackDocId },
          });
        });
      } else {
        window.location.hash = target;
      }
    },
    [fallbackDocId]
  );

  // Derive block metadata once per route change
  useEffect(() => {
    if (state.route.kind !== "block") {
      return;
    }

    let isCancelled = false;
    const { blockId, docId } = state.route;
    const resolvedDocId = docId ?? fallbackDocId ?? activeDocumentId ?? null;
    const cached = state.cache[blockId];

    const rafId = requestAnimationFrame(() => {
      if (isCancelled) return;
      const props = buildBlockRouteProps(editor, blockId, resolvedDocId, cached);
      dispatch({ type: "BLOCK_ROUTE_PROPS_RESOLVED", props });
    });

    return () => {
      isCancelled = true;
      cancelAnimationFrame(rafId);
    };
  }, [
    state.route.kind === "block" ? state.route.blockId : null,
    state.route.kind === "block" ? state.route.docId : null,
    editor,
    fallbackDocId,
    activeDocumentId,
    state.cache,
  ]);

  const updateCachedBlockUrl = useCallback((blockId: string, url: string) => {
    dispatch({ type: "UPDATE_BLOCK_URL", blockId, url });
  }, []);

  const helpers = useMemo((): RouterHelpers => {
    return {
      route: state.route,
      blockRouteProps:
        state.route.kind === "block" ? state.blockRouteProps : null,
      navigateToDoc,
      navigateToBlock,
      navigateToUrl,
      updateCachedBlockUrl,
    } as RouterHelpers;
  }, [state, navigateToDoc, navigateToBlock, navigateToUrl, updateCachedBlockUrl]);

  return helpers;
};

export { buildDocPath, buildBlockPath, buildUrlPath };
