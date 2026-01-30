/**
 * App Route Context
 *
 * Provides navigation helpers and route state that wraps TanStack Router.
 * This allows components to navigate without importing router internals directly.
 */
import React, { createContext, useContext, useCallback, useMemo } from "react";
import { useLocation, useRouter } from "@tanstack/react-router";

// Route types matching the old router API for compatibility
export type AppRoute =
  | { kind: "doc"; docId: string | null; focusBlockId?: string | null }
  | { kind: "block"; blockId: string; docId?: string | null }
  | { kind: "url"; url: string; docId?: string | null };

export type AppRouteContextValue = {
  route: AppRoute;
  navigateToDoc: (docId: string, focusBlockId?: string | null) => void;
  navigateToBlock: (blockId: string, docId?: string | null) => void;
  navigateToUrl: (url: string, docId?: string | null) => void;
};

const AppRouteContext = createContext<AppRouteContextValue | null>(null);

export function useAppRoute(): AppRouteContextValue {
  const context = useContext(AppRouteContext);
  if (!context) {
    throw new Error("useAppRoute must be used within an AppRouteProvider");
  }
  return context;
}

// Path building helpers (same as old router)
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

type AppRouteProviderProps = {
  children: React.ReactNode;
  fallbackDocId: string | null;
};

export function AppRouteProvider({ children, fallbackDocId }: AppRouteProviderProps) {
  const router = useRouter();
  const location = useLocation();

  // Parse current route from location
  const route = useMemo((): AppRoute => {
    const pathname = location.pathname;

    // Match /block/$blockId
    const blockMatch = pathname.match(/^\/block\/([^/]+)/);
    if (blockMatch) {
      const blockId = decodeURIComponent(blockMatch[1]);
      const search = new URLSearchParams(location.searchStr);
      const docId = search.get("doc");
      return {
        kind: "block",
        blockId,
        docId: docId ? decodeURIComponent(docId) : fallbackDocId,
      };
    }

    // Match /url/$url
    const urlMatch = pathname.match(/^\/url\/([^/]+)/);
    if (urlMatch) {
      const url = decodeURIComponent(urlMatch[1]);
      const search = new URLSearchParams(location.searchStr);
      const docId = search.get("doc");
      return {
        kind: "url",
        url,
        docId: docId ? decodeURIComponent(docId) : fallbackDocId,
      };
    }

    // Match /doc/$docId
    const docMatch = pathname.match(/^\/doc\/([^/]+)/);
    if (docMatch) {
      const docId = decodeURIComponent(docMatch[1]);
      const search = new URLSearchParams(location.searchStr);
      const focusBlockId = search.get("focus");
      return {
        kind: "doc",
        docId,
        focusBlockId: focusBlockId ? decodeURIComponent(focusBlockId) : null,
      };
    }

    // Default to doc route with fallback
    return {
      kind: "doc",
      docId: fallbackDocId,
      focusBlockId: null,
    };
  }, [location.pathname, location.searchStr, fallbackDocId]);

  // Navigate using hash - TanStack Router's hash history will pick it up
  const navigateToDoc = useCallback(
    (docId: string, focusBlockId?: string | null) => {
      const path = buildDocPath(docId, focusBlockId);
      window.location.hash = `#${path}`;
    },
    []
  );

  const navigateToBlock = useCallback(
    (blockId: string, docId?: string | null) => {
      const path = buildBlockPath(blockId, docId);
      window.location.hash = `#${path}`;
    },
    []
  );

  const navigateToUrl = useCallback(
    (url: string, docId?: string | null) => {
      const path = buildUrlPath(url, docId);
      window.location.hash = `#${path}`;
    },
    []
  );

  const value = useMemo(
    (): AppRouteContextValue => ({
      route,
      navigateToDoc,
      navigateToBlock,
      navigateToUrl,
    }),
    [route, navigateToDoc, navigateToBlock, navigateToUrl]
  );

  return (
    <AppRouteContext.Provider value={value}>{children}</AppRouteContext.Provider>
  );
}
