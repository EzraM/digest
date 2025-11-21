import React, { createContext, useContext, ReactNode } from "react";

interface DocumentContextValue {
  profileId: string;
  documentId: string | null;
}

const DocumentContext = createContext<DocumentContextValue | null>(null);

export const DocumentProvider: React.FC<{
  profileId: string;
  documentId: string | null;
  children: ReactNode;
}> = ({ profileId, documentId, children }) => {
  return (
    <DocumentContext.Provider value={{ profileId, documentId }}>
      {children}
    </DocumentContext.Provider>
  );
};

export const useDocumentContext = (): DocumentContextValue => {
  const context = useContext(DocumentContext);
  if (!context) {
    throw new Error("useDocumentContext must be used within a DocumentProvider");
  }
  return context;
};
