import { createContext, useContext, ReactNode } from "react";
import { useClipDraft } from "../hooks/useClipDraft";
import { ClipDraft } from "../types/clip";

type ClipDraftContextType = {
  drafts: ClipDraft[];
  addDraft: (draft: ClipDraft) => void;
  removeDraft: (id: string) => void;
  updateDraft: (id: string, updates: Partial<ClipDraft>) => void;
  getDraft: (id: string) => ClipDraft | undefined;
};

export const ClipDraftContext = createContext<ClipDraftContextType | null>(
  null
);

export const ClipDraftProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  const draftState = useClipDraft();

  if (!draftState) {
    throw new Error(
      "ClipDraftProvider: useClipDraft returned undefined"
    );
  }

  return (
    <ClipDraftContext.Provider value={draftState}>
      {children}
    </ClipDraftContext.Provider>
  );
};

export const useClipDraftContext = () => {
  const context = useContext(ClipDraftContext);
  if (!context) {
    throw new Error(
      "useClipDraftContext must be used within ClipDraftProvider"
    );
  }
  return context;
};



