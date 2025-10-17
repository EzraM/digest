import React, { useEffect, useLayoutEffect, useState } from "react";

const readRect = (element: HTMLElement) => element.getBoundingClientRect();

export const useSize = (target: React.RefObject<HTMLElement>) => {
  const [element, setElement] = useState<HTMLElement | null>(null);
  const [size, setSize] = useState<DOMRect>();

  useLayoutEffect(() => {
    if (target.current === element) return;
    setElement(target.current ?? null);
  });

  useLayoutEffect(() => {
    if (!element) return;
    setSize(readRect(element));
  }, [element]);

  useEffect(() => {
    if (!element) return;

    const updateSize = () => setSize(readRect(element));

    window.addEventListener("scroll", updateSize, { passive: true });

    const resizeObserver = new ResizeObserver(() => {
      updateSize();
    });

    resizeObserver.observe(element);

    return () => {
      window.removeEventListener("scroll", updateSize);
      resizeObserver.disconnect();
    };
  }, [element]);

  return size;
};
