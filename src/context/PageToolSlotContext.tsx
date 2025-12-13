import { createContext, useContext, ReactNode, useState, useCallback } from "react";

type PageToolSlotContextType = {
  content: ReactNode | null;
  registerTool: (content: ReactNode) => void;
  unregisterTool: () => void;
};

export const PageToolSlotContext =
  createContext<PageToolSlotContextType | null>(null);

export const PageToolSlotProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  const [content, setContent] = useState<ReactNode | null>(null);

  const registerTool = useCallback((toolContent: ReactNode) => {
    setContent(toolContent);
  }, []);

  const unregisterTool = useCallback(() => {
    setContent(null);
  }, []);

  return (
    <PageToolSlotContext.Provider
      value={{
        content,
        registerTool,
        unregisterTool,
      }}
    >
      {children}
    </PageToolSlotContext.Provider>
  );
};

export const usePageToolSlot = (): PageToolSlotContextType => {
  const context = useContext(PageToolSlotContext);
  if (!context) {
    throw new Error(
      "usePageToolSlot must be used within PageToolSlotProvider"
    );
  }
  return context;
};



