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
  activeProfileId: string | null;
  activeDocument: DocumentRecord | null;
};

type RendererDocumentsAction =
  | {
      type: "BOOTSTRAP_COMPLETED";
      payload: {
        profiles: ProfileRecord[];
        documentTrees: Record<string, DocumentTreeNode[]>;
        activeProfileId: string | null;
        activeDocument: DocumentRecord | null;
      };
    }
  | { type: "SET_PROFILES"; payload: { profiles: ProfileRecord[] } }
  | {
      type: "SET_DOCUMENT_TREE";
      payload: { profileId: string; tree: DocumentTreeNode[] };
    }
  | { type: "SET_ACTIVE_DOCUMENT"; payload: DocumentRecord | null }
  | { type: "SET_ACTIVE_PROFILE"; payload: string | null };

const initialState: RendererDocumentsState = {
  profiles: [],
  documentTrees: {},
  activeProfileId: null,
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
        activeProfileId: action.payload.activeProfileId,
        activeDocument: action.payload.activeDocument,
      };
    case "SET_PROFILES": {
      const { profiles } = action.payload;
      let activeProfileId = state.activeProfileId;
      if (
        activeProfileId &&
        !profiles.some((profile) => profile.id === activeProfileId)
      ) {
        const activeDocProfile = state.activeDocument?.profileId;
        if (
          activeDocProfile &&
          profiles.some((profile) => profile.id === activeDocProfile)
        ) {
          activeProfileId = activeDocProfile;
        } else {
          activeProfileId = profiles[0]?.id ?? null;
        }
      } else if (!activeProfileId) {
        activeProfileId = profiles[0]?.id ?? null;
      }
      return {
        ...state,
        profiles,
        activeProfileId,
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
      return {
        ...state,
        activeDocument: nextActive,
        activeProfileId: nextActive?.profileId ?? state.activeProfileId,
      };
    }
    case "SET_ACTIVE_PROFILE":
      return {
        ...state,
        activeProfileId: action.payload,
      };
    default:
      return state;
  }
};

export const useRendererDocuments = () => {
  const [state, dispatch] = useReducer(reducer, initialState);

  const setActiveProfileId = useCallback((profileId: string | null) => {
    dispatch({ type: "SET_ACTIVE_PROFILE", payload: profileId });
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

        const resolvedActiveProfileId =
          activeDoc?.profileId ?? profileList[0]?.id ?? null;
        let documentTrees: Record<string, DocumentTreeNode[]> = {};

        if (resolvedActiveProfileId) {
          try {
            const tree = await window.electronAPI.documents.getTree(
              resolvedActiveProfileId
            );
            if (!cancelled) {
              documentTrees = { [resolvedActiveProfileId]: tree };
            }
          } catch (treeError) {
            log.debug(
              `Failed to load tree for profile ${resolvedActiveProfileId}: ${treeError}`,
              "renderer"
            );
          }
        }

        dispatch({
          type: "BOOTSTRAP_COMPLETED",
          payload: {
            profiles: profileList,
            documentTrees,
            activeProfileId: resolvedActiveProfileId,
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

  const profileNeedingTree = useMemo(() => {
    if (!state.activeProfileId) {
      return null;
    }

    if (state.documentTrees[state.activeProfileId]) {
      return null;
    }

    return state.activeProfileId;
  }, [state.activeProfileId, state.documentTrees]);

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

  return {
    profiles: state.profiles,
    documentTrees: state.documentTrees,
    activeProfileId: state.activeProfileId,
    activeDocument: state.activeDocument,
    setActiveProfileId,
  };
};
