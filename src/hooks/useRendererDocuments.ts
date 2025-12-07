import { useCallback, useEffect, useMemo, useReducer } from "react";
import { log } from "../utils/rendererLogger";
import {
  DocumentRecord,
  DocumentTreeNode,
  ProfileRecord,
} from "../types/documents";

type RendererDocumentsState = {
  profiles: ProfileRecord[];
  documentTrees: Record<string, DocumentTreeNode[]>;
  // The profile currently being viewed in the sidebar (UI state)
  viewingProfileId: string | null;
  // The active document being edited (source of truth from main process)
  activeDocument: DocumentRecord | null;
};

type RendererDocumentsAction =
  | {
      type: "BOOTSTRAP_COMPLETED";
      payload: {
        profiles: ProfileRecord[];
        documentTrees: Record<string, DocumentTreeNode[]>;
        viewingProfileId: string | null;
        activeDocument: DocumentRecord | null;
      };
    }
  | { type: "SET_PROFILES"; payload: { profiles: ProfileRecord[] } }
  | {
      type: "SET_DOCUMENT_TREE";
      payload: { profileId: string; tree: DocumentTreeNode[] };
    }
  | { type: "SET_ACTIVE_DOCUMENT"; payload: DocumentRecord | null }
  | { type: "SET_VIEWING_PROFILE"; payload: string | null };

const initialState: RendererDocumentsState = {
  profiles: [],
  documentTrees: {},
  viewingProfileId: null,
  activeDocument: null,
};

const reducer = (
  state: RendererDocumentsState,
  action: RendererDocumentsAction
): RendererDocumentsState => {
  switch (action.type) {
    case "BOOTSTRAP_COMPLETED":
      return {
        ...state,
        profiles: action.payload.profiles,
        documentTrees: action.payload.documentTrees,
        viewingProfileId: action.payload.viewingProfileId,
        activeDocument: action.payload.activeDocument,
      };
    case "SET_PROFILES": {
      const { profiles } = action.payload;
      let viewingProfileId = state.viewingProfileId;

      // If the currently viewed profile was deleted, fall back
      if (viewingProfileId && !profiles.some((p) => p.id === viewingProfileId)) {
        // Prefer the active document's profile if it still exists
        const activeDocProfile = state.activeDocument?.profileId;
        if (activeDocProfile && profiles.some((p) => p.id === activeDocProfile)) {
          viewingProfileId = activeDocProfile;
        } else {
          viewingProfileId = profiles[0]?.id ?? null;
        }
      } else if (!viewingProfileId && profiles.length > 0) {
        viewingProfileId = profiles[0].id;
      }

      return {
        ...state,
        profiles,
        viewingProfileId,
      };
    }
    case "SET_DOCUMENT_TREE": {
      const { profileId, tree } = action.payload;
      return {
        ...state,
        documentTrees: {
          ...state.documentTrees,
          [profileId]: tree,
        },
      };
    }
    case "SET_ACTIVE_DOCUMENT": {
      const nextActive = action.payload;
      // When document switches, also switch the viewing profile to match
      return {
        ...state,
        activeDocument: nextActive,
        viewingProfileId: nextActive?.profileId ?? state.viewingProfileId,
      };
    }
    case "SET_VIEWING_PROFILE":
      return {
        ...state,
        viewingProfileId: action.payload,
      };
    default:
      return state;
  }
};

export const useRendererDocuments = () => {
  const [state, dispatch] = useReducer(reducer, initialState);

  const setViewingProfileId = useCallback((profileId: string | null) => {
    dispatch({ type: "SET_VIEWING_PROFILE", payload: profileId });
  }, []);

  useEffect(() => {
    let cancelled = false;
    const bootstrap = async () => {
      if (!window.electronAPI?.profiles || !window.electronAPI.documents) {
        return;
      }

      try {
        const [profileList, activeDoc] = await Promise.all([
          window.electronAPI.profiles.list(),
          window.electronAPI.documents.getActive(),
        ]);

        if (cancelled) return;

        const resolvedViewingProfileId =
          activeDoc?.profileId ?? profileList[0]?.id ?? null;
        let documentTrees: Record<string, DocumentTreeNode[]> = {};

        if (resolvedViewingProfileId) {
          try {
            const tree = await window.electronAPI.documents.getTree(
              resolvedViewingProfileId
            );
            if (!cancelled) {
              documentTrees = { [resolvedViewingProfileId]: tree };
            }
          } catch (treeError) {
            log.debug(
              `Failed to load tree for profile ${resolvedViewingProfileId}: ${treeError}`,
              "renderer"
            );
          }
        }

        dispatch({
          type: "BOOTSTRAP_COMPLETED",
          payload: {
            profiles: profileList,
            documentTrees,
            viewingProfileId: resolvedViewingProfileId,
            activeDocument: activeDoc ?? null,
          },
        });
      } catch (error) {
        log.debug(`Failed to bootstrap profiles/documents: ${error}`, "renderer");
      }
    };

    bootstrap();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!window.electronAPI?.profiles?.onUpdated) {
      return;
    }

    const unsubscribe = window.electronAPI.profiles.onUpdated(
      ({ profiles: nextProfiles }) => {
        dispatch({
          type: "SET_PROFILES",
          payload: { profiles: nextProfiles },
        });
      }
    );

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!window.electronAPI?.documents?.onTreeUpdated) {
      return;
    }

    const unsubscribe = window.electronAPI.documents.onTreeUpdated(
      ({ profileId, tree }) => {
        dispatch({
          type: "SET_DOCUMENT_TREE",
          payload: { profileId, tree },
        });
      }
    );

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!window.electronAPI?.documents?.onDocumentSwitched) {
      return;
    }

    const unsubscribe = window.electronAPI.documents.onDocumentSwitched(
      ({ document }) => {
        dispatch({
          type: "SET_ACTIVE_DOCUMENT",
          payload: document ?? null,
        });
      }
    );

    return unsubscribe;
  }, []);

  // Fetch tree for the viewing profile if not already loaded
  const profileNeedingTree = useMemo(() => {
    if (!state.viewingProfileId) {
      return null;
    }

    if (state.documentTrees[state.viewingProfileId]) {
      return null;
    }

    return state.viewingProfileId;
  }, [state.viewingProfileId, state.documentTrees]);

  useEffect(() => {
    if (!profileNeedingTree) {
      return;
    }
    let cancelled = false;

    const fetchTree = async () => {
      if (!window.electronAPI?.documents) {
        return;
      }

      try {
        const tree = await window.electronAPI.documents.getTree(
          profileNeedingTree
        );
        if (!cancelled) {
          dispatch({
            type: "SET_DOCUMENT_TREE",
            payload: { profileId: profileNeedingTree, tree },
          });
        }
      } catch (error) {
        log.debug(
          `Failed to load tree for profile ${profileNeedingTree}: ${error}`,
          "renderer"
        );
      }
    };

    fetchTree();

    return () => {
      cancelled = true;
    };
  }, [profileNeedingTree]);

  // For backwards compatibility, expose viewingProfileId as activeProfileId
  // This represents which profile's tree is being shown in the sidebar
  return {
    profiles: state.profiles,
    documentTrees: state.documentTrees,
    activeProfileId: state.viewingProfileId,
    activeDocument: state.activeDocument,
    setActiveProfileId: setViewingProfileId,
  };
};
