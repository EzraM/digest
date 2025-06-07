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
          border: "1px solid var(--mantine-color-gray-3)",
          boxShadow: "0 2px 10px rgba(0, 0, 0, 0.1)",
        },
        option: {
          "&[dataSelected='true']": {
            backgroundColor: "var(--mantine-color-blue-0)",
          },
          "&:hover": {
            backgroundColor: "var(--mantine-color-blue-0)",
          },
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
    // Short timeout to ensure the DOM is fully rendered
    const timer = setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
      }
    }, 50);

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
    }
    setSearch("");
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
          padding: "0.75rem",
          backgroundColor: "#fff",
        }}
        onClick={(e) => {
          log.debug(`Container div clicked: ${e.target}`, "app-overlay");
        }}
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
              log.debug(`Event target: ${event.target}`, "app-overlay");
              log.debug(
                `Event currentTarget: ${event.currentTarget}`,
                "app-overlay"
              );

              // Log all event properties for debugging
              const eventProps = Object.keys(event).filter(
                (key) =>
                  typeof event[key] !== "function" &&
                  key !== "target" &&
                  key !== "currentTarget"
              );
              log.debug(
                `Event properties: ${JSON.stringify(eventProps)}`,
                "app-overlay"
              );

              // Prevent event propagation to see if this helps identify the issue
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
            marginTop: "0.75rem",
            width: "100%",
          }}
        >
          <Combobox store={combobox} onOptionSubmit={handleOptionSelect}>
            <Combobox.Options>
              {filteredOptions.length === 0 ? (
                <Combobox.Empty>No results found</Combobox.Empty>
              ) : (
                filteredOptions.map((option) => (
                  <Combobox.Option
                    value={option.key}
                    key={option.key}
                    style={{
                      padding: "8px 12px",
                      borderRadius: "4px",
                      margin: "2px 0",
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

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
