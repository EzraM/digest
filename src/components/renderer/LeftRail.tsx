import React, { useState } from "react";
import { useMantineColorScheme } from "@mantine/core";
import { sidebarButtonColors } from "../../config/theme";
import { AddPageButton } from "../clip/AddPageButton";
import "./LeftRail.css";

const BrowserBackIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    aria-hidden="true"
  >
    <path
      d="M13 8H3M7 4 3 8l4 4"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const NotebookIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    aria-hidden="true"
  >
    <rect
      x="3"
      y="2.5"
      width="10"
      height="11"
      rx="1.5"
      stroke="currentColor"
      strokeWidth="1.5"
    />
    <path
      d="M6 2.5v11M8.5 6h2M8.5 8.5h2"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="round"
    />
  </svg>
);

type LeftRailProps = {
  viewId: string;
  onBack: () => void;
  canGoBrowserBack: boolean;
  isNavigatingBrowserBack: boolean;
  onBrowserBack: () => void;
};

export const LeftRail = ({
  viewId,
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
      <AddPageButton viewId={viewId} />
      <button
        className="left-rail__browser-back"
        data-available={canGoBrowserBack}
        type="button"
        onClick={onBrowserBack}
        disabled={!canGoBrowserBack || isNavigatingBrowserBack}
        tabIndex={canGoBrowserBack ? 0 : -1}
        aria-hidden={!canGoBrowserBack}
        style={{
          width: "100%",
          border: "none",
          borderRight: `1px solid ${browserColors.border}`,
          borderBottom: `1px solid ${browserColors.border}`,
          backgroundColor:
            hoveredButton === "browser"
              ? browserColors.hover
              : browserColors.background,
          color: browserColors.text,
          cursor: canGoBrowserBack ? "pointer" : "default",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 0,
          fontSize: "16px",
          fontWeight: 600,
        }}
        title={canGoBrowserBack ? "Go back in browser" : undefined}
        aria-label={canGoBrowserBack ? "Go back in browser" : undefined}
        onMouseEnter={() => setHoveredButton("browser")}
        onMouseLeave={() => setHoveredButton(null)}
      >
        {isNavigatingBrowserBack ? "…" : <BrowserBackIcon />}
      </button>
      <button
        className="left-rail__notebook"
        type="button"
        onClick={onBack}
        style={{
          width: "100%",
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
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            userSelect: "none",
          }}
        >
          <NotebookIcon />
        </span>
      </button>
    </div>
  );
};
