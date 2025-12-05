import { createContext, useContext, ReactNode, RefObject } from "react";

interface ScrollContainerContextValue {
  scrollContainerRef: RefObject<HTMLElement>;
}

const ScrollContainerContext = createContext<ScrollContainerContextValue | null>(
  null
);

export const ScrollContainerProvider = ({
  children,
  scrollContainerRef,
}: {
  children: ReactNode;
  scrollContainerRef: RefObject<HTMLElement>;
}) => {
  return (
    <ScrollContainerContext.Provider value={{ scrollContainerRef }}>
      {children}
    </ScrollContainerContext.Provider>
  );
};

export const useScrollContainer = (): HTMLElement | null => {
  const context = useContext(ScrollContainerContext);
  if (!context) {
    return null;
  }
  return context.scrollContainerRef.current;
};

