import React, { useEffect, useMemo, useState } from "react";
import ReactDOM from "react-dom/client";
import {
  MantineProvider,
  Highlight,
  Chip,
  rem,
} from "@mantine/core";
import {
  slashCommandOptions,
} from "../src/data/slashCommandOptions";
import {
  SlashCommandOption,
  SlashCommandResultsPayload,
} from "../src/types/slashCommand";
import { log } from "../src/utils/rendererLogger";

// Ensure TypeScript recognizes the electronAPI on window
declare global {
  interface Window {
    electronAPI: {
      selectBlockType: (blockKey: string) => void;
      cancelSlashCommand: () => void;
      onSlashCommandResults: (
        callback: (payload: SlashCommandResultsPayload) => void
      ) => () => void;
      notifySlashCommandOverlayReady: () => void;
    };
  }
}

// Custom theme for better styling
const theme = {
  components: {
    Combobox: {
      styles: {
        option: {
          "&[data-combobox-selected]": {
            backgroundColor: "var(--mantine-color-blue-1)",
            color: "var(--mantine-color-blue-9)",
          },
        },
      },
    },
  },
};

const App = () => {
  const [results, setResults] = useState<SlashCommandOption[]>(
    slashCommandOptions,
  );
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [query, setQuery] = useState<string>("");
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [loadingState, setLoadingState] = useState<
    SlashCommandResultsPayload["loadingState"]
  >("loading-initial");

  useEffect(() => {
    log.debug("Notifying main process that HUD overlay is ready", "app-overlay");
    window.electronAPI.notifySlashCommandOverlayReady();
  }, []);

  useEffect(() => {
    if (!window.electronAPI?.onSlashCommandResults) {
      log.debug(
        "onSlashCommandResults bridge unavailable in HUD overlay",
        "app-overlay",
      );
      return;
    }

    const unsubscribe = window.electronAPI.onSlashCommandResults(
      (payload) => {
        log.debug(
          `Received slash command results update: ${payload.items.length} items (selected: ${payload.selectedIndex})`,
          "app-overlay",
        );
        setQuery(payload.query);
        setResults(payload.items.length ? payload.items : []);
        setSelectedIndex(
          payload.selectedIndex !== null ? payload.selectedIndex : 0,
        );
        setHoveredIndex(null);
        setLoadingState(payload.loadingState ?? "loaded");
      },
    );

    return () => {
      unsubscribe?.();
    };
  }, []);

  const activeIndex = useMemo(() => {
    if (hoveredIndex !== null) {
      return hoveredIndex;
    }

    if (!results.length) {
      return -1;
    }

    return Math.min(Math.max(selectedIndex ?? 0, 0), results.length - 1);
  }, [hoveredIndex, results.length, selectedIndex]);

  const handleOptionSelect = (value: string) => {
    log.debug(
      `🟢 onOptionSubmit triggered with value: ${value}`,
      "app-overlay"
    );

    const selectedOption = results.find((opt) => opt.key === value);
    if (selectedOption) {
      log.debug(
        `🟢 Selected option: ${JSON.stringify(selectedOption)}`,
        "app-overlay"
      );
      window.electronAPI.selectBlockType(selectedOption.key!);
      log.debug(
        "🟢 Block selection sent, HUD should close and return focus",
        "app-overlay"
      );
    } else {
      log.error(`❌ Could not find option with key: ${value}`, "app-overlay");
    }
  };

  return (
    <MantineProvider theme={theme}>
      <div
        style={{
          padding: "12px",
          backgroundColor: "#fff",
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            log.debug(
              "Escape key pressed in HUD, cancelling slash command",
              "app-overlay"
            );
            window.electronAPI?.cancelSlashCommand();
          }
        }}
        tabIndex={-1}
      >
        <div
          style={{
            border: "1px solid var(--mantine-color-gray-3)",
            borderRadius: "8px",
            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              maxHeight: "320px",
              overflowY: "auto",
            }}
          >
            {loadingState !== "loaded" && results.length === 0 ? (
              <div
                style={{
                  padding: "12px",
                  color: "var(--mantine-color-gray-6)",
                  fontSize: rem(14),
                }}
              >
                Loading results…
              </div>
            ) : results.length === 0 ? (
              <div
                style={{
                  padding: "12px",
                  color: "var(--mantine-color-gray-6)",
                  fontSize: rem(14),
                }}
              >
                No results found
              </div>
            ) : (
              results.map((option, index) => {
                const isActive = index === activeIndex;

                return (
                  <div
                    key={option.key || `option-${index}`}
                    onMouseEnter={() => setHoveredIndex(index)}
                    onMouseLeave={() => setHoveredIndex(null)}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      handleOptionSelect(option.key);
                    }}
                    style={{
                      padding: "10px 14px",
                      cursor: "pointer",
                      backgroundColor: isActive
                        ? "var(--mantine-color-blue-0)"
                        : index === 0
                          ? "var(--mantine-color-gray-0)"
                          : "#fff",
                      borderBottom:
                        index < results.length - 1
                          ? "1px solid var(--mantine-color-gray-2)"
                          : "none",
                      transition: "background-color 120ms ease",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div
                          style={{
                            fontSize: "0.95rem",
                            fontWeight: 600,
                            lineHeight: 1.3,
                            color: isActive
                              ? "var(--mantine-color-blue-9)"
                              : "var(--mantine-color-dark-7)",
                          }}
                        >
                          <Highlight
                            highlight={query}
                            highlightStyles={{
                              backgroundColor: "var(--mantine-color-yellow-2)",
                              padding: 0,
                              borderRadius: "2px",
                            }}
                          >
                            {option.title}
                          </Highlight>
                        </div>
                        {option.subtext && (
                          <div
                            style={{
                              fontSize: "0.85rem",
                              color: isActive
                                ? "var(--mantine-color-blue-7)"
                                : "var(--mantine-color-gray-6)",
                              lineHeight: 1.3,
                              marginTop: "2px",
                            }}
                          >
                            <Highlight
                              highlight={query}
                              highlightStyles={{
                                backgroundColor:
                                  "var(--mantine-color-yellow-2)",
                                padding: 0,
                                borderRadius: "2px",
                              }}
                            >
                              {option.subtext}
                            </Highlight>
                          </div>
                        )}
                      </div>
                      {option.badge && (
                        <Chip
                          size="xs"
                          variant="light"
                          checked={false}
                          style={{
                            pointerEvents: "none",
                            backgroundColor: isActive
                              ? "var(--mantine-color-blue-1)"
                              : "var(--mantine-color-gray-1)",
                            color: isActive
                              ? "var(--mantine-color-blue-8)"
                              : "var(--mantine-color-gray-7)",
                          }}
                        >
                          {option.badge}
                        </Chip>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </MantineProvider>
  );
};

// Create root only if it doesn't exist to prevent the duplicate root warning
const rootElement = document.getElementById("root")!;
let root = (rootElement as any)._reactRoot;

if (!root) {
  root = ReactDOM.createRoot(rootElement);
  (rootElement as any)._reactRoot = root;
  log.debug("Created new React root for HUD", "app-overlay");
} else {
  log.debug("Reusing existing React root for HUD", "app-overlay");
}

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
