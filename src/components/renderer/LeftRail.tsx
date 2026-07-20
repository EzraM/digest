import React, { useState } from "react";
import { useMantineColorScheme } from "@mantine/core";
import { sidebarButtonColors } from "../../config/theme";

type LeftRailProps = {
  onBack: () => void;
  canGoBrowserBack: boolean;
  isNavigatingBrowserBack: boolean;
  onBrowserBack: () => void;
};

export const LeftRail = ({
  onBack,
  canGoBrowserBack,
  isNavigatingBrowserBack,
  onBrowserBack,
}: LeftRailProps) => {
  const [hoveredButton, setHoveredButton] = useState<"browser" | "document" | null>(
    null
  );
  const { colorScheme } = useMantineColorScheme();
  const documentColors =
    sidebarButtonColors.close[colorScheme === "dark" ? "dark" : "light"];
  const browserColors =
    sidebarButtonColors.browserBack[
      colorScheme === "dark" ? "dark" : "light"
    ];

  return (
    <div
      style={{
        width: "2rem",
        height: "100%",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <button
        type="button"
        onClick={onBrowserBack}
        disabled={!canGoBrowserBack || isNavigatingBrowserBack}
        style={{
          width: "100%",
          height: "25%",
          border: "none",
          borderRight: `1px solid ${browserColors.border}`,
          borderBottom: `1px solid ${browserColors.border}`,
          backgroundColor:
            hoveredButton === "browser"
              ? browserColors.hover
              : browserColors.background,
          color: canGoBrowserBack ? browserColors.text : `${browserColors.text}66`,
          cursor:
            !canGoBrowserBack || isNavigatingBrowserBack
              ? "not-allowed"
              : "pointer",
          padding: 0,
          fontSize: "16px",
          fontWeight: 600,
          transition: "background-color 150ms ease",
        }}
        title={
          canGoBrowserBack ? "Go back in browser" : "No previous browser page"
        }
        aria-label="Go back in browser"
        onMouseEnter={() => setHoveredButton("browser")}
        onMouseLeave={() => setHoveredButton(null)}
      >
        {isNavigatingBrowserBack ? "…" : "←"}
      </button>
      <button
        type="button"
        onClick={onBack}
        style={{
          width: "100%",
          height: "75%",
          border: "none",
          borderRight: `1px solid ${documentColors.border}`,
          backgroundColor:
            hoveredButton === "document"
              ? documentColors.hover
              : documentColors.background,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 0,
          transition: "background-color 150ms ease",
        }}
        title="Back to document"
        aria-label="Back to document"
        onMouseEnter={() => setHoveredButton("document")}
        onMouseLeave={() => setHoveredButton(null)}
      >
        <span
          style={{
            color: documentColors.text,
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
    </div>
  );
};
