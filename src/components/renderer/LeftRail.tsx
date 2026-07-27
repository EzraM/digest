import React from "react";
import { AddPageButton } from "../clip/AddPageButton";
import { NotebookAddress } from "../../domains/notebook-content/core/NotebookAddress";
import { NotebookWriteClient } from "../../domains/notebook-content/application/NotebookWriteClient";
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
  notebookAddress: NotebookAddress;
  notebookWriter: NotebookWriteClient;
  onBack: () => void;
  canGoBrowserBack: boolean;
  isNavigatingBrowserBack: boolean;
  onBrowserBack: () => void;
};

export const LeftRail = ({
  viewId,
  notebookAddress,
  notebookWriter,
  onBack,
  canGoBrowserBack,
  isNavigatingBrowserBack,
  onBrowserBack,
}: LeftRailProps) => {
  return (
    <div
      className="left-rail"
      style={{
        width: "2rem",
        height: "100%",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <AddPageButton
        viewId={viewId}
        notebookAddress={notebookAddress}
        notebookWriter={notebookWriter}
      />
      <button
        className="left-rail__browser-back"
        data-available={canGoBrowserBack}
        type="button"
        onClick={onBrowserBack}
        disabled={!canGoBrowserBack || isNavigatingBrowserBack}
        tabIndex={canGoBrowserBack ? 0 : -1}
        aria-hidden={!canGoBrowserBack}
        title={canGoBrowserBack ? "Go back in browser" : undefined}
        aria-label={canGoBrowserBack ? "Go back in browser" : undefined}
      >
        {isNavigatingBrowserBack ? "…" : <BrowserBackIcon />}
      </button>
      <button
        className="left-rail__notebook"
        type="button"
        onClick={onBack}
        title="Back to document"
        aria-label="Back to document"
      >
        <span>
          <NotebookIcon />
        </span>
      </button>
    </div>
  );
};
