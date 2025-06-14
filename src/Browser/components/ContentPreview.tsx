import React from "react";
import { ContentPreview as ContentPreviewData } from "../../services/IntelligentUrlHandler";

interface ContentPreviewProps {
  preview: ContentPreviewData;
  onExpand: () => void;
  onEdit: () => void;
  onRemove?: () => void;
}

export const ContentPreview: React.FC<ContentPreviewProps> = ({
  preview,
  onExpand,
  onEdit,
  onRemove,
}) => {
  // Get appropriate icon based on content type
  const getTypeIcon = (type: string) => {
    switch (type) {
      case "documentation":
        return "📚";
      case "article":
        return "📄";
      case "tool":
        return "🔧";
      case "social":
        return "💬";
      default:
        return "🌐";
    }
  };

  // Get type color
  const getTypeColor = (type: string) => {
    switch (type) {
      case "documentation":
        return "#4285f4";
      case "article":
        return "#34a853";
      case "tool":
        return "#ea4335";
      case "social":
        return "#fbbc04";
      default:
        return "#666";
    }
  };

  return (
    <div
      style={{
        border: "1px solid #e0e0e0",
        borderRadius: "8px",
        backgroundColor: "#fff",
        maxWidth: "100%",
        transition: "all 0.2s ease",
        cursor: "pointer",
      }}
      onClick={onExpand}
      onMouseOver={(e) => {
        e.currentTarget.style.borderColor = "#1a73e8";
        e.currentTarget.style.boxShadow = "0 2px 8px rgba(26, 115, 232, 0.1)";
      }}
      onMouseOut={(e) => {
        e.currentTarget.style.borderColor = "#e0e0e0";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      {/* Header with title and controls */}
      <div
        style={{
          padding: "12px 16px",
          display: "flex",
          alignItems: "flex-start",
          gap: "12px",
        }}
      >
        {/* Type icon */}
        <div
          style={{
            fontSize: "20px",
            lineHeight: "1",
            marginTop: "2px",
            flexShrink: 0,
          }}
        >
          {getTypeIcon(preview.type)}
        </div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Title and domain */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              marginBottom: "6px",
            }}
          >
            <h3
              style={{
                margin: 0,
                fontSize: "16px",
                fontWeight: "600",
                color: "#1a73e8",
                flex: 1,
                lineHeight: "1.3",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {preview.title}
            </h3>
            <span
              style={{
                fontSize: "12px",
                color: getTypeColor(preview.type),
                backgroundColor: `${getTypeColor(preview.type)}15`,
                padding: "2px 8px",
                borderRadius: "12px",
                marginLeft: "8px",
                flexShrink: 0,
                fontWeight: "500",
              }}
            >
              {preview.domain}
            </span>
          </div>

          {/* Description */}
          <p
            style={{
              margin: "0 0 8px 0",
              fontSize: "14px",
              color: "#666",
              lineHeight: "1.4",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {preview.description}
          </p>

          {/* Key points */}
          {preview.keyPoints && preview.keyPoints.length > 0 && (
            <div style={{ marginBottom: "8px" }}>
              {preview.keyPoints.slice(0, 3).map((point, index) => (
                <div
                  key={index}
                  style={{
                    fontSize: "12px",
                    color: "#666",
                    marginBottom: "2px",
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  <span style={{ color: "#999", marginRight: "6px" }}>•</span>
                  <span
                    style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {point}
                  </span>
                </div>
              ))}
              {preview.keyPoints.length > 3 && (
                <div
                  style={{
                    fontSize: "12px",
                    color: "#999",
                    fontStyle: "italic",
                  }}
                >
                  +{preview.keyPoints.length - 3} more points
                </div>
              )}
            </div>
          )}

          {/* URL */}
          <div
            style={{
              fontSize: "12px",
              color: "#006621",
              fontFamily: "monospace",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {preview.url}
          </div>
        </div>

        {/* Action buttons */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "4px",
            flexShrink: 0,
          }}
          onClick={(e) => e.stopPropagation()} // Prevent expand when clicking buttons
        >
          <button
            onClick={onEdit}
            style={{
              background: "none",
              border: "1px solid #e0e0e0",
              borderRadius: "4px",
              padding: "4px 8px",
              cursor: "pointer",
              fontSize: "12px",
              color: "#666",
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.backgroundColor = "#f0f0f0";
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
            }}
            title="Edit URL"
          >
            ✏️
          </button>
          {onRemove && (
            <button
              onClick={onRemove}
              style={{
                background: "none",
                border: "1px solid #e0e0e0",
                borderRadius: "4px",
                padding: "4px 8px",
                cursor: "pointer",
                fontSize: "12px",
                color: "#666",
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.backgroundColor = "#fef2f2";
                e.currentTarget.style.borderColor = "#fca5a5";
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
                e.currentTarget.style.borderColor = "#e0e0e0";
              }}
              title="Remove block"
            >
              🗑️
            </button>
          )}
        </div>
      </div>

      {/* Expand hint */}
      <div
        style={{
          padding: "8px 16px",
          borderTop: "1px solid #f0f0f0",
          backgroundColor: "#f8f9fa",
          borderRadius: "0 0 8px 8px",
          textAlign: "center",
        }}
      >
        <span
          style={{
            fontSize: "12px",
            color: "#666",
            fontWeight: "500",
          }}
        >
          Click to expand and view content
        </span>
      </div>
    </div>
  );
};
