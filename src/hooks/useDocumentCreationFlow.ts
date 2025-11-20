import { useCallback, useReducer } from "react";
import { DocumentRecord } from "../types/documents";
import { log } from "../utils/rendererLogger";

type CreationState = {
  pendingRenameId: string | null;
  pendingOpenId: string | null;
};

type CreationAction =
  | { type: "SET_PENDING"; payload: { documentId: string } }
  | { type: "CONSUME_RENAME" }
  | { type: "DOCUMENT_READY" }
  | { type: "REMOVE_PENDING"; payload: { documentId: string } };

const initialState: CreationState = {
  pendingRenameId: null,
  pendingOpenId: null,
};

const reducer = (state: CreationState, action: CreationAction): CreationState => {
  switch (action.type) {
    case "SET_PENDING":
      return {
        pendingRenameId: action.payload.documentId,
        pendingOpenId: action.payload.documentId,
      };
    case "CONSUME_RENAME":
      return {
        ...state,
        pendingRenameId: null,
      };
    case "DOCUMENT_READY":
      return {
        pendingRenameId: null,
        pendingOpenId: null,
      };
    case "REMOVE_PENDING":
      if (
        state.pendingRenameId !== action.payload.documentId &&
        state.pendingOpenId !== action.payload.documentId
      ) {
        return state;
      }
      return {
        pendingRenameId:
          state.pendingRenameId === action.payload.documentId
            ? null
            : state.pendingRenameId,
        pendingOpenId:
          state.pendingOpenId === action.payload.documentId
            ? null
            : state.pendingOpenId,
      };
    default:
      return state;
  }
};

export const useDocumentCreationFlow = ({
  activateProfile,
}: {
  activateProfile: (profileId: string) => void;
}) => {
  const [state, dispatch] = useReducer(reducer, initialState);

  const handleCreateDocument = useCallback(
    async ({
      profileId,
      parentDocumentId = null,
    }: {
      profileId: string;
      parentDocumentId?: string | null;
    }) => {
      if (!window.electronAPI?.documents) {
        return null;
      }

      try {
        const document = await window.electronAPI.documents.create({
          profileId,
          parentDocumentId,
        });
        dispatch({
          type: "SET_PENDING",
          payload: { documentId: document.id },
        });
        activateProfile(document.profileId);
        return document;
      } catch (error) {
        log.debug(`Failed to create document: ${error}`, "renderer");
        return null;
      }
    },
    [activateProfile]
  );

  const handlePendingRenameConsumed = useCallback(() => {
    dispatch({ type: "CONSUME_RENAME" });
  }, []);

  const handlePendingDocumentNamed = useCallback(
    async (document: DocumentRecord) => {
      if (state.pendingOpenId !== document.id) {
        return;
      }

      dispatch({ type: "DOCUMENT_READY" });

      if (!window.electronAPI?.documents) {
        return;
      }

      try {
        await window.electronAPI.documents.switch(document.id);
      } catch (error) {
        log.debug(`Failed to switch to new document: ${error}`, "renderer");
      }
    },
    [state.pendingOpenId]
  );

  const handlePendingDocumentRemoved = useCallback((documentId: string) => {
    dispatch({ type: "REMOVE_PENDING", payload: { documentId } });
  }, []);

  return {
    pendingRenameDocumentId: state.pendingRenameId,
    handleCreateDocument,
    handlePendingRenameConsumed,
    handlePendingDocumentNamed,
    handlePendingDocumentRemoved,
  };
};
