import React from "react";
import { DownloadNotification } from "../core/types";

interface DownloadItemProps {
  notification: DownloadNotification;
  onClick: (savePath: string) => void;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

export const DownloadItemView: React.FC<DownloadItemProps> = ({
  notification,
  onClick,
}) => {
  const { fileName, totalBytes, receivedBytes, status, savePath } = notification;
  const progress = totalBytes > 0 ? Math.round((receivedBytes / totalBytes) * 100) : 0;
  const isComplete = status === "completed";
  const isFailed = status === "failed" || status === "cancelled";

  return (
    <div
      style={{
        padding: "12px 16px",
        background: isFailed ? "#fef2f2" : isComplete ? "#f0fdf4" : "#f0f9ff",
        borderRadius: "6px",
        display: "flex",
        alignItems: "center",
        gap: "10px",
        boxShadow: "0 -2px 8px rgba(0, 0, 0, 0.1)",
        cursor: isComplete ? "pointer" : "default",
      }}
      onClick={() => {
        if (isComplete) onClick(savePath);
      }}
    >
      {/* Status indicator */}
      <span style={{ fontSize: "18px", flexShrink: 0 }}>
        {isComplete ? "✓" : isFailed ? "✗" : "↓"}
      </span>

      {/* File info + progress */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontWeight: 500,
            marginBottom: "4px",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {isComplete
            ? `Downloaded: ${fileName}`
            : isFailed
              ? `Download failed: ${fileName}`
              : `Downloading: ${fileName}`}
        </div>

        {/* Progress bar for in-progress downloads */}
        {status === "in_progress" && (
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div
              style={{
                flex: 1,
                height: "4px",
                background: "#dbeafe",
                borderRadius: "2px",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${progress}%`,
                  height: "100%",
                  background: "#3b82f6",
                  borderRadius: "2px",
                  transition: "width 0.2s ease",
                }}
              />
            </div>
            <span style={{ fontSize: "12px", color: "#6b7280", flexShrink: 0 }}>
              {totalBytes > 0
                ? `${formatBytes(receivedBytes)} / ${formatBytes(totalBytes)}`
                : formatBytes(receivedBytes)}
            </span>
          </div>
        )}

        {/* Completed hint */}
        {isComplete && (
          <div style={{ fontSize: "12px", color: "#6b7280" }}>
            Click to show in folder
          </div>
        )}
      </div>
    </div>
  );
};
