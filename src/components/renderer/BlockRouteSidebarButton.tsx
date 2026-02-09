import React, { useState } from "react";
import { useMantineColorScheme } from "@mantine/core";
import { sidebarButtonColors } from "../../config/theme";

type BlockRouteSidebarButtonProps = {
  onBack: () => void;
};

export const BlockRouteSidebarButton = ({
  onBack,
}: BlockRouteSidebarButtonProps) => {
  const [isHovered, setIsHovered] = useState(false);
  const { colorScheme } = useMantineColorScheme();
  const colors =
    sidebarButtonColors.close[colorScheme === "dark" ? "dark" : "light"];

  return (
    <button
      type="button"
      onClick={onBack}
      style={{
        width: "2rem",
        height: "100%",
        border: "none",
        borderRight: `1px solid ${colors.border}`,
        backgroundColor: isHovered ? colors.hover : colors.background,
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
          color: colors.text,
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
