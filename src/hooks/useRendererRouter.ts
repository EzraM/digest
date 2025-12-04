import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type RendererRoute =
  | { kind: "doc"; docId: string | null; focusBlockId?: string | null }
  | { kind: "block"; blockId: string; docId?: string | null };

type RouterHelpers = {
  route: RendererRoute;
  navigateToDoc: (docId: string, focusBlockId?: string | null) => void;
  navigateToBlock: (blockId: string, docId?: string | null) => void;
};

const normalizePath = (hash: string) => {
  const trimmed = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!trimmed.startsWith("/")) {
    return `/${trimmed}`;
  }
  return trimmed;
};

const buildDocPath = (docId: string, focusBlockId?: string | null) => {
  const query = focusBlockId ? `?focus=${encodeURIComponent(focusBlockId)}` : "";
  return `/doc/${encodeURIComponent(docId)}${query}`;
};

const buildBlockPath = (blockId: string, docId?: string | null) => {
  const query = docId ? `?doc=${encodeURIComponent(docId)}` : "";
  return `/block/${encodeURIComponent(blockId)}${query}`;
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

export const useRendererRouter = (
  fallbackDocId: string | null,
  activeDocumentId: string | null
): RouterHelpers => {
  const [route, setRoute] = useState<RendererRoute>(() =>
    parseRoute(window.location.hash, fallbackDocId)
  );
  const lastSwitchedDocRef = useRef<string | null>(null);

  // Keep route in sync with hash changes
  useEffect(() => {
    const handleHashChange = () => {
      setRoute(parseRoute(window.location.hash, fallbackDocId));
    };

    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, [fallbackDocId]);

  // Ensure we have a default doc route when the doc id becomes known
  useEffect(() => {
    if (!route.docId && route.kind === "doc" && fallbackDocId) {
      const targetHash = `#${buildDocPath(fallbackDocId)}`;
      window.location.hash = targetHash;
      setRoute({ kind: "doc", docId: fallbackDocId, focusBlockId: null });
    }

    if (!window.location.hash && fallbackDocId) {
      window.location.hash = `#${buildDocPath(fallbackDocId)}`;
    }
  }, [fallbackDocId, route]);

  // Keep Electron's active document in sync with route doc id
  useEffect(() => {
    if (!window.electronAPI?.documents?.switch) {
      return;
    }

    const targetDocId =
      route.kind === "doc"
        ? route.docId
        : route.docId ?? fallbackDocId ?? activeDocumentId;

    if (!targetDocId) {
      return;
    }

    if (targetDocId === activeDocumentId || targetDocId === lastSwitchedDocRef.current) {
      return;
    }

    window.electronAPI.documents.switch(targetDocId).catch(() => {
      // Ignore errors; renderer state will stay as-is
    });
    lastSwitchedDocRef.current = targetDocId;
  }, [route, fallbackDocId, activeDocumentId]);

  const navigateToDoc = useCallback(
    (docId: string, focusBlockId?: string | null) => {
      const target = `#${buildDocPath(docId, focusBlockId)}`;
      if (window.location.hash === target) {
        setRoute({ kind: "doc", docId, focusBlockId: focusBlockId ?? null });
      } else {
        window.location.hash = target;
      }
    },
    []
  );

  const navigateToBlock = useCallback((blockId: string, docId?: string | null) => {
    const target = `#${buildBlockPath(blockId, docId ?? fallbackDocId ?? undefined)}`;
    if (window.location.hash === target) {
      setRoute({ kind: "block", blockId, docId: docId ?? fallbackDocId });
    } else {
      window.location.hash = target;
    }
  }, [fallbackDocId]);

  const helpers = useMemo(
    () => ({ route, navigateToDoc, navigateToBlock }),
    [route, navigateToDoc, navigateToBlock]
  );

  return helpers;
};

export { buildDocPath, buildBlockPath };
