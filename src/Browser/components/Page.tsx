import React, { useReducer, useEffect } from "react";
import { PageProps, BrowserState, BrowserAction } from "../types";
import { BrowserSlot } from "./BrowserSlot";

export function Page({blockId, url}: PageProps) {
  const [state, dispatch] = useReducer(
    (state: BrowserState, action: BrowserAction) => {
      switch (action.type) {
        case "set-url":
          return {
            status: "entry",
            url: action.url,
          };
        case "enter":
          return {
            status: "page",
            url: state.url,
          };
        default:
          return state;
      }
    },
    { status: url ? "page" : "entry", url: url || "" }
  );

  const handleInput = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      dispatch({ type: "enter" });
    }
  };

  // Format URL to ensure it has the proper protocol
  const formatUrl = (url: string): string => {
    if (!url) return url;

    // If URL doesn't start with a protocol, add https://
    if (!url.match(/^[a-zA-Z]+:\/\//)) {
      return `https://${url}`;
    }

    return url;
  };

  useEffect(() => {
    const formattedUrl = formatUrl(state.url);
    console.log("[Browser] Updating URL:", {
      blockId,
      url: formattedUrl,
      originalUrl: state.url,
      status: state.status,
    });

    if (state.status === "page" && formattedUrl) {
      window.electronAPI.updateBrowserUrl({ blockId, url: formattedUrl });
    }
  }, [blockId, state.status, state.url]);

  // Cleanup when component unmounts
  useEffect(() => {
    return () => {
      console.log(`[Browser] Cleaning up browser for blockId: ${blockId}`);
      window.electronAPI.removeBrowser(blockId);
    };
  }, [blockId]);

  return (
    <div>
      {state.status === "entry" && (
        <input
          style={{ height: 30, width: 500 }}
          key="locationBar"
          type="text"
          value={state.url}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            dispatch({ type: "set-url", url: e.target.value })
          }
          onKeyPress={handleInput}
          placeholder="Enter URL (e.g., google.com)"
        />
      )}
      {state.status === "page" && (
        <div
          key="browserContainer"
          style={{
            border: "2px solid black",
            width: "calc(96vw - 118px)",
            height: 800,
          }}
        >
          <BrowserSlot key={blockId} blockId={blockId} />
        </div>
      )}
    </div>
  );
} 