import React, { ReactNode, createContext, useContext } from "react";
import { RendererRoute } from "../hooks/useRendererRouter";

type RendererRouteContextValue = {
  route: RendererRoute;
  navigateToDoc: (docId: string, focusBlockId?: string | null) => void;
  navigateToBlock: (blockId: string, docId?: string | null) => void;
};

const RendererRouteContext = createContext<RendererRouteContextValue | null>(null);

export const RendererRouteProvider = ({
  value,
  children,
}: {
  value: RendererRouteContextValue;
  children: ReactNode;
}) => (
  <RendererRouteContext.Provider value={value}>
    {children}
  </RendererRouteContext.Provider>
);

export const useRendererRoute = (): RendererRouteContextValue => {
  const context = useContext(RendererRouteContext);
  if (!context) {
    throw new Error("useRendererRoute must be used within a RendererRouteProvider");
  }
  return context;
};
