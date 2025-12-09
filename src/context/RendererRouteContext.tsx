import React, { ReactNode, createContext, useContext } from "react";
import { RouterHelpers } from "../hooks/useRendererRouter";

export type RendererRouteContextValue = RouterHelpers;

const RendererRouteContext = createContext<RendererRouteContextValue | null>(
  null
);

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
    throw new Error(
      "useRendererRoute must be used within a RendererRouteProvider"
    );
  }
  return context;
};
