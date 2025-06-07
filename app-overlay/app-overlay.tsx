import React, { useState, useEffect, useRef } from "react";
import ReactDOM from "react-dom/client";
import {
  MantineProvider,
  Combobox,
  TextInput,
  useCombobox,
  Highlight,
  Chip,
  createTheme,
  rem,
} from "@mantine/core";
import blockOptions from "./add-blocks.json";
import { log } from "../src/utils/rendererLogger";

// Add type definition for window.electronAPI
declare global {
  interface Window {
    electronAPI: {
      selectBlockType: (blockKey: string) => void;
      cancelSlashCommand: () => void;
    };
  }
}

// Create a theme that matches BlockNote's Mantine styling
const theme = createTheme({
  primaryColor: "blue",
  components: {
    TextInput: {
      styles: {
        input: {
          "&:focus": {
            borderColor: "var(--mantine-color-blue-6)",
          },
        },
      },
    },
    Combobox: {
      styles: {
        dropdown: {
          border: "none",
          boxShadow: "none",
          padding: 0,
          background: "transparent",
        },
        options: {
          padding: 0,
          margin: 0,
        },
        option: {
          "&[data-combobox-selected]": {
            backgroundColor: "var(--mantine-color-blue-0)",
            color: "var(--mantine-color-blue-9)",
          },
          "&:hover": {
            backgroundColor: "var(--mantine-color-gray-0)",
          },
          borderRadius: "6px",
          margin: "1px 0",
        },
      },
    },
  },
});

interface BlockOption {
  badge?: string;
  key?: string;
  title: string;
  subtext?: string;
  aliases?: string[];
  group: string;
}

const App = () => {
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const combobox = useCombobox({
    defaultOpened: true,
  });

  // Focus the input field when the component mounts
  useEffect(() => {
    console.log("[HUD Focus] Setting up focus for HUD input");
    log.debug("Setting up focus for HUD input", "app-overlay");

    // Try multiple times to ensure focus works
    const attemptFocus = (attempt = 1, maxAttempts = 5) => {
      console.log(
        `[HUD Focus] Attempt ${attempt}, inputRef.current:`,
        !!inputRef.current
      );

      if (inputRef.current) {
        console.log(`[HUD Focus] Focus attempt ${attempt} for HUD input`);
        log.debug(`Focus attempt ${attempt} for HUD input`, "app-overlay");
        try {
          inputRef.current.focus();

          // Check if focus was successful
          const focused = document.activeElement === inputRef.current;
          console.log(
            `[HUD Focus] Focus success:`,
            focused,
            "activeElement:",
            document.activeElement
          );

          if (focused) {
            console.log("[HUD Focus] Successfully focused HUD input");
            log.debug("Successfully focused HUD input", "app-overlay");
            return;
          }
        } catch (error) {
          console.log(`[HUD Focus] Focus attempt ${attempt} failed:`, error);
          log.debug(`Focus attempt ${attempt} failed: ${error}`, "app-overlay");
        }
      } else {
        console.log(
          `[HUD Focus] inputRef.current is null on attempt ${attempt}`
        );
      }

      // If focus failed and we haven't exceeded max attempts, try again
      if (attempt < maxAttempts) {
        setTimeout(() => attemptFocus(attempt + 1, maxAttempts), 50);
      } else {
        console.log("[HUD Focus] All focus attempts failed");
        log.debug("All focus attempts failed", "app-overlay");
      }
    };

    // Start focus attempts after a brief delay to let the DOM settle
    const timer = setTimeout(() => {
      console.log("[HUD Focus] Starting focus attempts");
      attemptFocus();
    }, 100);

    return () => clearTimeout(timer);
  }, []);

  // Add logging for component mount and unmount
  useEffect(() => {
    log.debug("App overlay component mounted", "app-overlay");

    return () => {
      log.debug("App overlay component unmounted", "app-overlay");
    };
  }, []);

  const filteredOptions = blockOptions.filter((option) => {
    const searchLower = search.toLowerCase();
    if (!searchLower) return true;

    // Check title
    if (option.title.toLowerCase().includes(searchLower)) return true;

    // Check subtext
    if (option.subtext?.toLowerCase().includes(searchLower)) return true;

    // Check aliases - show if any alias matches exactly or includes the search
    if (
      option.aliases?.some((alias) => {
        const aliasLower = alias.toLowerCase();
        return aliasLower === searchLower || aliasLower.includes(searchLower);
      })
    )
      return true;

    return false;
  });

  const handleOptionSelect = (value: string) => {
    const selectedOption = blockOptions.find((opt) => opt.key === value);
    if (selectedOption) {
      log.debug(
        `Selected option: ${JSON.stringify(selectedOption)}`,
        "app-overlay"
      );
      window.electronAPI.selectBlockType(selectedOption.key);

      // Clear search after selection to close the HUD
      setSearch("");

      // Note: Focus will be returned to main window by AppOverlay.hide()
      // when the HUD closes automatically after this selection
      log.debug(
        "Block selection sent, HUD should close and return focus",
        "app-overlay"
      );
    }
  };

  // Add logging for window events
  useEffect(() => {
    const handleBlur = () => {
      log.debug("Window blur event detected", "app-overlay");
    };

    const handleFocus = () => {
      log.debug("Window focus event detected", "app-overlay");
    };

    const handleClick = () => {
      log.debug("Window click event detected", "app-overlay");
    };

    window.addEventListener("blur", handleBlur);
    window.addEventListener("focus", handleFocus);
    window.addEventListener("click", handleClick);

    return () => {
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("click", handleClick);
    };
  }, []);

  return (
    <MantineProvider theme={theme}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100vh",
          padding: "12px",
          backgroundColor: "#fff",
          boxSizing: "border-box",
        }}
        onClick={(e) => {
          log.debug(`Container div clicked: ${e.target}`, "app-overlay");
        }}
        onKeyDown={(e) => {
          // Handle escape key to cancel slash command
          if (e.key === "Escape") {
            log.debug(
              "Escape key pressed in HUD, cancelling slash command",
              "app-overlay"
            );
            // Cancel the entire slash command, which will hide the HUD
            window.electronAPI?.cancelSlashCommand();
          }
        }}
        tabIndex={-1} // Make container focusable for keyboard events
      >
        <div style={{ flexShrink: 0, width: "100%" }}>
          <TextInput
            ref={inputRef}
            placeholder="Search blocks..."
            value={search}
            onChange={(event) => {
              log.debug("TextInput onChange event", "app-overlay");
              setSearch(event.currentTarget.value);
            }}
            onFocus={(event) => {
              log.debug("TextInput onFocus event", "app-overlay");
            }}
            onBlur={(event) => {
              log.debug("TextInput onBlur event", "app-overlay");
            }}
            onClick={(event) => {
              log.debug("TextInput onClick event", "app-overlay");

              // Ensure input gets focus when clicked
              if (inputRef.current) {
                log.debug("Focusing input after click", "app-overlay");
                inputRef.current.focus();
              }

              event.stopPropagation();
            }}
            size="md"
            radius="md"
            styles={{
              input: {
                width: "100%",
                fontSize: rem(14),
                fontWeight: 500,
              },
            }}
          />
        </div>

        <div
          style={{
            flexGrow: 1,
            overflowY: "auto",
            marginTop: "8px",
            width: "100%",
            minHeight: 0, // Important for flex scroll containers
          }}
        >
          <Combobox
            store={combobox}
            onOptionSubmit={handleOptionSelect}
            styles={{
              dropdown: {
                border: "none",
                padding: 0,
                background: "transparent",
                boxShadow: "none",
              },
            }}
          >
            <Combobox.Options
              style={{
                maxHeight: "none", // Remove height restrictions
                overflow: "visible", // Remove internal scrollbars
                padding: 0,
                margin: 0,
              }}
            >
              {filteredOptions.length === 0 ? (
                <Combobox.Empty>No results found</Combobox.Empty>
              ) : (
                filteredOptions.map((option) => (
                  <Combobox.Option
                    value={option.key}
                    key={option.key}
                    style={{
                      padding: "6px 12px",
                      borderRadius: "6px",
                      margin: "1px 0",
                      cursor: "pointer",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div
                          style={{
                            fontSize: "0.95rem",
                            fontWeight: 500,
                            lineHeight: 1.3,
                          }}
                        >
                          <Highlight
                            highlight={search}
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
                              color: "var(--mantine-color-gray-6)",
                              lineHeight: 1.3,
                              marginTop: "2px",
                            }}
                          >
                            <Highlight
                              highlight={search}
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
                            backgroundColor: "var(--mantine-color-gray-1)",
                            color: "var(--mantine-color-gray-7)",
                          }}
                        >
                          {option.badge}
                        </Chip>
                      )}
                    </div>
                  </Combobox.Option>
                ))
              )}
            </Combobox.Options>
          </Combobox>
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
