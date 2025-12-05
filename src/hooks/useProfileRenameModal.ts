import { useCallback, useReducer } from "react";
import { log } from "../utils/rendererLogger";
import { ProfileRecord } from "../types/documents";

type UseProfileRenameModalOptions = {
  onProfileRenamed?: (profile: ProfileRecord) => void;
};

type RenameState = {
  isModalOpen: boolean;
  profileId: string | null;
  profileName: string;
  profileError: string | null;
  isRenaming: boolean;
};

type RenameAction =
  | { type: "OPEN"; profile: ProfileRecord }
  | { type: "CLOSE" }
  | { type: "SET_NAME"; name: string }
  | { type: "SET_ERROR"; error: string | null }
  | { type: "START_RENAMING" }
  | { type: "FINISH_RENAMING" };

const initialState: RenameState = {
  isModalOpen: false,
  profileId: null,
  profileName: "",
  profileError: null,
  isRenaming: false,
};

const renameReducer = (
  state: RenameState,
  action: RenameAction
): RenameState => {
  switch (action.type) {
    case "OPEN":
      return {
        ...state,
        isModalOpen: true,
        profileId: action.profile.id,
        profileName: action.profile.name,
        profileError: null,
      };
    case "CLOSE":
      return initialState;
    case "SET_NAME":
      return {
        ...state,
        profileName: action.name,
        ...(state.profileError && { profileError: null }),
      };
    case "SET_ERROR":
      return {
        ...state,
        profileError: action.error,
      };
    case "START_RENAMING":
      return {
        ...state,
        isRenaming: true,
        profileError: null,
      };
    case "FINISH_RENAMING":
      return {
        ...state,
        isRenaming: false,
      };
    default:
      return state;
  }
};

export const useProfileRenameModal = ({
  onProfileRenamed,
}: UseProfileRenameModalOptions = {}) => {
  const [state, dispatch] = useReducer(renameReducer, initialState);

  const openModal = useCallback((profile: ProfileRecord) => {
    dispatch({ type: "OPEN", profile });
  }, []);

  const closeModal = useCallback(() => {
    dispatch({ type: "CLOSE" });
  }, []);

  const handleNameChange = useCallback((value: string) => {
    dispatch({ type: "SET_NAME", name: value });
  }, []);

  const handleConfirm = useCallback(async () => {
    if (!state.profileId) {
      return;
    }

    const trimmed = state.profileName.trim();
    if (!trimmed) {
      dispatch({ type: "SET_ERROR", error: "Profile name is required" });
      return;
    }

    if (!window.electronAPI?.profiles) {
      dispatch({ type: "SET_ERROR", error: "Profiles API unavailable" });
      return;
    }

    dispatch({ type: "START_RENAMING" });
    try {
      const profile = await window.electronAPI.profiles.rename({
        profileId: state.profileId,
        name: trimmed,
      });
      if (profile) {
        onProfileRenamed?.(profile);
        dispatch({ type: "CLOSE" });
      }
    } catch (error) {
      log.debug(`Failed to rename profile: ${error}`, "renderer");
      dispatch({ type: "SET_ERROR", error: "Failed to rename profile" });
    } finally {
      dispatch({ type: "FINISH_RENAMING" });
    }
  }, [state.profileId, state.profileName, onProfileRenamed]);

  return {
    isModalOpen: state.isModalOpen,
    profileId: state.profileId,
    profileName: state.profileName,
    profileError: state.profileError,
    isRenaming: state.isRenaming,
    openModal,
    closeModal,
    handleNameChange,
    handleConfirm,
  };
};
