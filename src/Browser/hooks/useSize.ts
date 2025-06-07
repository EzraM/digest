import React, { useState, useLayoutEffect, useEffect } from "react";

export const useSize = (target: React.RefObject<HTMLElement>) => {
  const [size, setSize] = useState<DOMRect>();

  useLayoutEffect(() => {
    if (target?.current) {
      setSize(target.current.getBoundingClientRect());
    }
  }, [target.current]);

  // Handle scroll events
  useEffect(() => {
    const listener = () => {
      if (target?.current) {
        setSize(target.current.getBoundingClientRect());
      }
    };
    window.addEventListener("scroll", listener, { passive: true });
    return () => window.removeEventListener("scroll", listener);
  }, [target]);

  // Handle resize events using ResizeObserver
  useEffect(() => {
    if (!target.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      if (!entries.length) return;

      const entry = entries[0];
      // Use border-box size to include padding and border
      const boxSize = entry.borderBoxSize[0];
      if (boxSize) {
        const rect = target.current?.getBoundingClientRect();
        if (rect) {
          setSize({
            ...rect,
            width: boxSize.inlineSize,
            height: boxSize.blockSize,
          });
        }
      } else {
        // Fallback for browsers that don't support borderBoxSize
        setSize(target.current?.getBoundingClientRect());
      }
    });

    resizeObserver.observe(target.current);
    return () => resizeObserver.disconnect();
  }, [target]);

  return size;
}; 