import { useCallback, useReducer } from "react";
import { log } from "../utils/rendererLogger";
import { ProfileRecord, DocumentTreeNode } from "../types/documents";

type UseProfileDeleteModalOptions = {
  onProfileDeleted?: (profileId: string) => void;
};

const countDocumentsInTree = (tree: DocumentTreeNode[]): number => {
  let count = 0;
  for (const node of tree) {
    count += 1;
    if (node.children && node.children.length > 0) {
      count += countDocumentsInTree(node.children);
    }
  }
  return count;
};

type DeleteState = {
  isModalOpen: boolean;
  profile: ProfileRecord | null;
  pageCount: number;
  isDeleting: boolean;
};

type DeleteAction =
  | { type: "OPEN"; profile: ProfileRecord; pageCount: number }
  | { type: "CLOSE" }
  | { type: "START_DELETING" }
  | { type: "FINISH_DELETING" };

const initialState: DeleteState = {
  isModalOpen: false,
  profile: null,
  pageCount: 0,
  isDeleting: false,
};

const deleteReducer = (
  state: DeleteState,
  action: DeleteAction
): DeleteState => {
  switch (action.type) {
    case "OPEN":
      return {
        ...state,
        isModalOpen: true,
        profile: action.profile,
        pageCount: action.pageCount,
      };
    case "CLOSE":
      return initialState;
    case "START_DELETING":
      return {
        ...state,
        isDeleting: true,
      };
    case "FINISH_DELETING":
      return {
        ...state,
        isDeleting: false,
      };
    default:
      return state;
  }
};

export const useProfileDeleteModal = ({
  onProfileDeleted,
}: UseProfileDeleteModalOptions = {}) => {
  const [state, dispatch] = useReducer(deleteReducer, initialState);

  const openModal = useCallback(
    (profileToDelete: ProfileRecord, documentTree: DocumentTreeNode[]) => {
      const count = countDocumentsInTree(documentTree);
      dispatch({ type: "OPEN", profile: profileToDelete, pageCount: count });
    },
    []
  );

  const closeModal = useCallback(() => {
    dispatch({ type: "CLOSE" });
  }, []);

  const handleConfirm = useCallback(async () => {
    if (!state.profile) {
      return;
    }

    if (!window.electronAPI?.profiles) {
      return;
    }

    dispatch({ type: "START_DELETING" });
    try {
      await window.electronAPI.profiles.delete(state.profile.id);
      onProfileDeleted?.(state.profile.id);
      dispatch({ type: "CLOSE" });
    } catch (error) {
      log.debug(`Failed to delete profile: ${error}`, "renderer");
    } finally {
      dispatch({ type: "FINISH_DELETING" });
    }
  }, [state.profile, onProfileDeleted]);

  return {
    isModalOpen: state.isModalOpen,
    profile: state.profile,
    pageCount: state.pageCount,
    isDeleting: state.isDeleting,
    openModal,
    closeModal,
    handleConfirm,
  };
};
