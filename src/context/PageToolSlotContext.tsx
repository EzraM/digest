import { createContext, useContext, ReactNode, useState, useCallback } from "react";

type PageToolSlotContextType = {
  content: ReactNode | null;
  isVisible: boolean;
  registerTool: (content: ReactNode) => void;
  unregisterTool: () => void;
  toggleVisibility: () => void;
  setVisibility: (visible: boolean) => void;
};

export const PageToolSlotContext =
  createContext<PageToolSlotContextType | null>(null);

export const PageToolSlotProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  const [content, setContent] = useState<ReactNode | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  const registerTool = useCallback((toolContent: ReactNode) => {
    setContent(toolContent);
  }, []);

  const unregisterTool = useCallback(() => {
    setContent(null);
    setIsVisible(false);
  }, []);

  const toggleVisibility = useCallback(() => {
    setIsVisible((prev) => !prev);
  }, []);

  const setVisibility = useCallback((visible: boolean) => {
    setIsVisible(visible);
  }, []);

  return (
    <PageToolSlotContext.Provider
      value={{
        content,
        isVisible,
        registerTool,
        unregisterTool,
        toggleVisibility,
        setVisibility,
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
