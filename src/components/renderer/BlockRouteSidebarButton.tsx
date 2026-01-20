import React, { useState } from "react";

type BlockRouteSidebarButtonProps = {
  onBack: () => void;
};

export const BlockRouteSidebarButton = ({
  onBack,
}: BlockRouteSidebarButtonProps) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <button
      type="button"
      onClick={onBack}
      style={{
        width: "2rem",
        height: "100%",
        border: "none",
        borderRight: "1px solid #e0e0e0",
        backgroundColor: isHovered ? "#d0ebff" : "#e7f5ff",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 0,
        transition: "background-color 150ms ease",
      }}
      title="Back to document"
      aria-label="Collapse block"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <span
        style={{
          color: "#1c7ed6",
          fontSize: "14px",
          fontWeight: 600,
          writingMode: "vertical-rl",
          textOrientation: "mixed",
          transform: "rotate(180deg)",
          userSelect: "none",
        }}
      >
        ‹
      </span>
    </button>
  );
};
