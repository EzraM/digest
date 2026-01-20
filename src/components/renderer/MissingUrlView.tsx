import React from "react";

type MissingUrlViewProps = {
  title: string;
  onBack: () => void;
};

export const MissingUrlView = ({ title, onBack }: MissingUrlViewProps) => {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#f5f6f8",
        color: "#333",
        flexDirection: "column",
        gap: "8px",
      }}
    >
      <div style={{ fontWeight: 600 }}>Unable to load this site block.</div>
      <div style={{ fontSize: "0.9rem", color: "#666" }}>
        {title} is missing a URL.
      </div>
      <button
        type="button"
        onClick={onBack}
        style={{
          padding: "8px 16px",
          borderRadius: "12px",
          border: "1px solid #d0d7de",
          cursor: "pointer",
          backgroundColor: "#fff",
        }}
      >
        Back
      </button>
    </div>
  );
};
