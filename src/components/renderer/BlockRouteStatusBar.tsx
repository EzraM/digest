import React from "react";
import { ClipButtons } from "../clip/ClipButtons";

type BlockRouteStatusBarProps = {
  title: string;
  urlString: string;
  viewId: string;
};

export const BlockRouteStatusBar = ({
  title,
  urlString,
  viewId,
}: BlockRouteStatusBarProps) => {
  return (
    <div
      style={{
        height: "28px",
        backgroundColor: "#fff",
        borderTop: "1px solid #e0e0e0",
        display: "flex",
        alignItems: "center",
        gap: "8px",
        paddingLeft: "6px",
        paddingRight: "6px",
        fontSize: "11px",
        fontFamily: "monospace",
        color: "#666",
      }}
    >
      <span
        style={{
          userSelect: "none",
          color: "#666",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          minWidth: 0,
          maxWidth: "60%",
        }}
      >
        {title || urlString}
      </span>
      <ClipButtons context="page" viewId={viewId} placement="toolbar" />
    </div>
  );
};
