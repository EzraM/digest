import React from "react";
interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  domain: string;
  relevanceScore: number;
}

interface SearchResultsProps {
  results: SearchResult[];
  onSelect: (url: string) => void;
  onCancel: () => void;
  query: string;
}

export const SearchResults: React.FC<SearchResultsProps> = ({
  results,
  onSelect,
  onCancel,
  query,
}) => {
  return (
    <div
      style={{
        border: "1px solid #e0e0e0",
        borderRadius: "6px",
        backgroundColor: "#fff",
        maxWidth: "100%",
        boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "12px 16px",
          borderBottom: "1px solid #e0e0e0",
          backgroundColor: "#f8f9fa",
          borderRadius: "6px 6px 0 0",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>
          <span style={{ fontWeight: "600", color: "#333", fontSize: "14px" }}>
            Search Results for "{query}"
          </span>
          <span style={{ color: "#666", fontSize: "12px", marginLeft: "8px" }}>
            {results.length} result{results.length !== 1 ? "s" : ""}
          </span>
        </div>
        <button
          onClick={onCancel}
          style={{
            background: "none",
            border: "none",
            color: "#666",
            cursor: "pointer",
            fontSize: "18px",
            padding: "4px",
            borderRadius: "4px",
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.backgroundColor = "#f0f0f0";
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.backgroundColor = "transparent";
          }}
        >
          ×
        </button>
      </div>

      {/* Results List */}
      <div style={{ maxHeight: "400px", overflowY: "auto" }}>
        {results.map((result, index) => (
          <div
            key={index}
            onClick={() => onSelect(result.url)}
            style={{
              padding: "12px 16px",
              borderBottom:
                index < results.length - 1 ? "1px solid #f0f0f0" : "none",
              cursor: "pointer",
              transition: "background-color 0.2s",
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.backgroundColor = "#f8f9fa";
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
            }}
          >
            {/* Title and Domain */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                marginBottom: "4px",
              }}
            >
              <h4
                style={{
                  margin: 0,
                  fontSize: "14px",
                  fontWeight: "600",
                  color: "#1a73e8",
                  flex: 1,
                  lineHeight: "1.3",
                }}
              >
                {result.title}
              </h4>
              <span
                style={{
                  fontSize: "12px",
                  color: "#666",
                  backgroundColor: "#f0f0f0",
                  padding: "2px 6px",
                  borderRadius: "3px",
                  marginLeft: "8px",
                }}
              >
                {result.domain}
              </span>
            </div>

            {/* URL */}
            <div
              style={{
                fontSize: "12px",
                color: "#006621",
                marginBottom: "4px",
                fontFamily: "monospace",
              }}
            >
              {result.url}
            </div>

            {/* Snippet */}
            <p
              style={{
                margin: 0,
                fontSize: "13px",
                color: "#666",
                lineHeight: "1.4",
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {result.snippet}
            </p>

            {/* Relevance Score (for debugging) */}
            {process.env.NODE_ENV === "development" && (
              <div
                style={{
                  fontSize: "10px",
                  color: "#999",
                  marginTop: "4px",
                }}
              >
                Relevance: {(result.relevanceScore * 100).toFixed(1)}%
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Footer with actions */}
      <div
        style={{
          padding: "12px 16px",
          borderTop: "1px solid #e0e0e0",
          backgroundColor: "#f8f9fa",
          borderRadius: "0 0 6px 6px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span style={{ fontSize: "12px", color: "#666" }}>
          Click a result to navigate, or search again
        </span>
        <button
          onClick={onCancel}
          style={{
            padding: "6px 12px",
            border: "1px solid #ccc",
            borderRadius: "4px",
            backgroundColor: "white",
            color: "#666",
            cursor: "pointer",
            fontSize: "12px",
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.backgroundColor = "#f0f0f0";
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.backgroundColor = "white";
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
};
