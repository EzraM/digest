import React, { useEffect, useLayoutEffect, useState } from "react";

const readRect = (element: HTMLElement) => element.getBoundingClientRect();

const hasRectChanged = (prev: DOMRect | undefined, next: DOMRect) => {
  if (!prev) {
    return true;
  }

  return (
    prev.x !== next.x ||
    prev.y !== next.y ||
    prev.width !== next.width ||
    prev.height !== next.height
  );
};

export const useSize = (target: React.RefObject<HTMLElement>) => {
  const [element, setElement] = useState<HTMLElement | null>(null);
  const [size, setSize] = useState<DOMRect>();

  useLayoutEffect(() => {
    if (target.current === element) return;
    setElement(target.current ?? null);
  });

  useEffect(() => {
    if (!element) return;

    let frameId: number | null = null;
    let prevRect: DOMRect | undefined;

    const measure = () => {
      if (!element.isConnected) {
        frameId = window.requestAnimationFrame(measure);
        return;
      }

      const nextRect = readRect(element);
      if (hasRectChanged(prevRect, nextRect)) {
        prevRect = nextRect;
        setSize(nextRect);
      }

      frameId = window.requestAnimationFrame(measure);
    };

    prevRect = readRect(element);
    setSize(prevRect);
    frameId = window.requestAnimationFrame(measure);

    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [element]);

  return size;
};
