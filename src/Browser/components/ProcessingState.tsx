import React from "react";

interface ProcessingStateProps {
  input: string;
  stage: "analyzing" | "searching" | "fetching" | "classifying";
  onCancel: () => void;
}

export const ProcessingState: React.FC<ProcessingStateProps> = ({
  input,
  stage,
  onCancel,
}) => {
  const getStageInfo = (stage: string) => {
    switch (stage) {
      case "analyzing":
        return {
          icon: "🤔",
          text: "Analyzing your input...",
          description: "Determining the best action for your request",
        };
      case "searching":
        return {
          icon: "🔍",
          text: "Searching the web...",
          description: "Finding relevant content and resources",
        };
      case "fetching":
        return {
          icon: "📡",
          text: "Fetching content preview...",
          description: "Getting page information and summary",
        };
      case "classifying":
        return {
          icon: "🏷️",
          text: "Classifying content...",
          description: "Understanding what type of content this is",
        };
      default:
        return {
          icon: "⚡",
          text: "Processing...",
          description: "Working on your request",
        };
    }
  };

  const stageInfo = getStageInfo(stage);

  return (
    <div
      style={{
        border: "1px solid #e0e0e0",
        borderRadius: "6px",
        backgroundColor: "#fff",
        maxWidth: "100%",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Animated progress bar */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          height: "3px",
          backgroundColor: "#1a73e8",
          animation: "progress 2s ease-in-out infinite",
          width: "30%",
        }}
      />
      <style>
        {`
          @keyframes progress {
            0% { left: -30%; }
            50% { left: 50%; }
            100% { left: 100%; }
          }
        `}
      </style>

      {/* Content */}
      <div
        style={{
          padding: "16px",
          display: "flex",
          alignItems: "center",
          gap: "16px",
        }}
      >
        {/* Animated icon */}
        <div
          style={{
            fontSize: "24px",
            animation: "pulse 1.5s ease-in-out infinite",
            flexShrink: 0,
          }}
        >
          {stageInfo.icon}
        </div>
        <style>
          {`
            @keyframes pulse {
              0%, 100% { transform: scale(1); opacity: 1; }
              50% { transform: scale(1.1); opacity: 0.8; }
            }
          `}
        </style>

        {/* Text content */}
        <div style={{ flex: 1 }}>
          {/* Input being processed */}
          <div
            style={{
              fontSize: "14px",
              color: "#333",
              marginBottom: "4px",
              fontWeight: "500",
            }}
          >
            Processing: "{input}"
          </div>

          {/* Stage description */}
          <div
            style={{
              fontSize: "16px",
              color: "#1a73e8",
              fontWeight: "600",
              marginBottom: "4px",
            }}
          >
            {stageInfo.text}
          </div>

          {/* Stage details */}
          <div
            style={{
              fontSize: "12px",
              color: "#666",
              lineHeight: "1.4",
            }}
          >
            {stageInfo.description}
          </div>
        </div>

        {/* Cancel button */}
        <button
          onClick={onCancel}
          style={{
            background: "none",
            border: "1px solid #e0e0e0",
            borderRadius: "4px",
            padding: "8px 12px",
            cursor: "pointer",
            fontSize: "12px",
            color: "#666",
            flexShrink: 0,
            transition: "all 0.2s",
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.backgroundColor = "#fef2f2";
            e.currentTarget.style.borderColor = "#fca5a5";
            e.currentTarget.style.color = "#dc2626";
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.backgroundColor = "transparent";
            e.currentTarget.style.borderColor = "#e0e0e0";
            e.currentTarget.style.color = "#666";
          }}
        >
          Cancel
        </button>
      </div>

      {/* Dots animation for additional visual feedback */}
      <div
        style={{
          padding: "0 16px 12px 16px",
          display: "flex",
          justifyContent: "center",
          gap: "4px",
        }}
      >
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              width: "6px",
              height: "6px",
              borderRadius: "50%",
              backgroundColor: "#1a73e8",
              animation: `dot-bounce 1.4s ease-in-out infinite both`,
              animationDelay: `${i * 0.16}s`,
            }}
          />
        ))}
      </div>
      <style>
        {`
          @keyframes dot-bounce {
            0%, 80%, 100% {
              transform: scale(0.8);
              opacity: 0.5;
            }
            40% {
              transform: scale(1);
              opacity: 1;
            }
          }
        `}
      </style>
    </div>
  );
};
