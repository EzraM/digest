import { createContext, ReactNode, useContext } from "react";

type TitleBarContextValue = {
  setContextualContent: (content: ReactNode | null) => void;
};

export const TitleBarContext = createContext<TitleBarContextValue | null>(null);

export const useTitleBar = () => {
  const context = useContext(TitleBarContext);
  if (!context) {
    throw new Error("useTitleBar must be used within a TitleBarContext provider");
  }
  return context;
};
