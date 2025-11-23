import { useCallback, useEffect, useState } from "react";

export const useCopyToClipboard = (text: string, resetDelay = 1500) => {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch (error) {
      console.error("Failed to copy to clipboard:", error);
    }
  }, [text]);

  useEffect(() => {
    if (!copied) return;
    const timeout = setTimeout(() => setCopied(false), resetDelay);
    return () => clearTimeout(timeout);
  }, [copied, resetDelay]);

  return { copied, copy };
};
