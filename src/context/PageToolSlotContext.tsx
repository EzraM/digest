import { createContext, useContext, ReactNode, useState, useCallback } from "react";

type PageToolSlotContextType = {
  content: ReactNode | null;
  isVisible: boolean;
  registerTool: (id: string, content: ReactNode) => void;
  unregisterTool: (id: string) => void;
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
  const [tools, setTools] = useState<Map<string, ReactNode>>(new Map());
  const [isVisible, setIsVisible] = useState(false);

  const registerTool = useCallback((id: string, toolContent: ReactNode) => {
    setTools((prev) => {
      const next = new Map(prev);
      next.set(id, toolContent);
      return next;
    });
  }, []);

  const unregisterTool = useCallback((id: string) => {
    setTools((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
    // Reset visibility if no tools remain
    setTools((current) => {
      if (current.size === 0) {
        setIsVisible(false);
      }
      return current;
    });
  }, []);

  const toggleVisibility = useCallback(() => {
    setIsVisible((prev) => !prev);
  }, []);

  const setVisibility = useCallback((visible: boolean) => {
    setIsVisible(visible);
  }, []);

  // Compose all registered tools into a single content node
  const content = tools.size > 0 ? <>{Array.from(tools.values())}</> : null;

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
