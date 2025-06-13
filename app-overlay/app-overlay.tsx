import React, { useEffect, useState, useRef } from "react";
import ReactDOM from "react-dom/client";
import {
  MantineProvider,
  TextInput,
  Combobox,
  useCombobox,
  Highlight,
  Chip,
  rem,
} from "@mantine/core";
import addBlocksData from "./add-blocks.json";
import { log } from "../src/utils/rendererLogger";

// Ensure TypeScript recognizes the electronAPI on window
declare global {
  interface Window {
    electronAPI: {
      selectBlockType: (blockKey: string) => void;
      cancelSlashCommand: () => void;
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
  const [blockOptions] = useState<BlockOption[]>(addBlocksData);
  const inputRef = useRef<HTMLInputElement>(null);

  const combobox = useCombobox({
    onDropdownClose: () => {
      log.debug("Combobox dropdown closing", "app-overlay");
      combobox.resetSelectedOption();
    },
    onDropdownOpen: () => {
      log.debug("Combobox dropdown opening", "app-overlay");
      combobox.selectFirstOption();
    },
  });

  // Focus management
  useEffect(() => {
    const attemptFocus = (attempt = 1, maxAttempts = 5) => {
      if (inputRef.current) {
        console.log(`[HUD Focus] Attempt ${attempt}: Focusing input`);
        inputRef.current.focus();

        // Check if focus was successful
        if (document.activeElement === inputRef.current) {
          console.log(`[HUD Focus] Success on attempt ${attempt}`);
          log.debug(`Focus successful on attempt ${attempt}`, "app-overlay");
          return;
        }
      }

      if (attempt < maxAttempts) {
        setTimeout(() => attemptFocus(attempt + 1, maxAttempts), 50);
      } else {
        console.log("[HUD Focus] All focus attempts failed");
        log.debug("All focus attempts failed", "app-overlay");
      }
    };

    const timer = setTimeout(() => {
      console.log("[HUD Focus] Starting focus attempts");
      attemptFocus();
    }, 100);

    return () => clearTimeout(timer);
  }, []);

  // Open dropdown when component mounts
  useEffect(() => {
    combobox.openDropdown();
    log.debug("Opened combobox dropdown on mount", "app-overlay");
  }, []);

  const filteredOptions = blockOptions.filter((option) => {
    const searchLower = search.toLowerCase();
    if (!searchLower) return true;

    if (option.title.toLowerCase().includes(searchLower)) return true;
    if (option.subtext?.toLowerCase().includes(searchLower)) return true;
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
    log.debug(
      `🟢 onOptionSubmit triggered with value: ${value}`,
      "app-overlay"
    );

    const selectedOption = blockOptions.find((opt) => opt.key === value);
    if (selectedOption) {
      log.debug(
        `🟢 Selected option: ${JSON.stringify(selectedOption)}`,
        "app-overlay"
      );
      window.electronAPI.selectBlockType(selectedOption.key!);
      setSearch("");
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
        <Combobox
          store={combobox}
          onOptionSubmit={handleOptionSelect}
          withinPortal={false}
        >
          <Combobox.Target>
            <TextInput
              ref={inputRef}
              placeholder="Search blocks..."
              value={search}
              onChange={(event) => {
                log.debug("TextInput onChange event", "app-overlay");
                setSearch(event.currentTarget.value);
                combobox.openDropdown();
                combobox.updateSelectedOptionIndex();
              }}
              onFocus={(event) => {
                log.debug("TextInput onFocus event", "app-overlay");
                combobox.openDropdown();
              }}
              onBlur={(event) => {
                log.debug("TextInput onBlur event", "app-overlay");
                combobox.closeDropdown();
              }}
              onClick={() => {
                log.debug("TextInput onClick event", "app-overlay");
                combobox.openDropdown();
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  log.debug("Enter pressed in search input", "app-overlay");
                  const selectedValue = combobox.selectActiveOption();
                  log.debug(
                    `combobox.selectActiveOption() returned: ${selectedValue}`,
                    "app-overlay"
                  );
                } else {
                  combobox.updateSelectedOptionIndex(event as any);
                }
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
          </Combobox.Target>

          <Combobox.Dropdown
            style={{
              marginTop: "8px",
              border: "1px solid var(--mantine-color-gray-3)",
              borderRadius: "8px",
              boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1)",
            }}
          >
            <Combobox.Options
              style={{
                maxHeight: "320px", // Reduced to account for input field + padding (400px total - 80px for input/spacing)
                padding: "0px", // Remove padding that might cause gaps
                overflowY: "auto", // Ensure scrolling works properly
              }}
            >
              {filteredOptions.length === 0 ? (
                <Combobox.Empty>No results found</Combobox.Empty>
              ) : (
                filteredOptions.map((option, index) => (
                  <Combobox.Option
                    value={option.key!}
                    key={option.key || `option-${index}`}
                    style={{
                      padding: "8px 12px",
                      borderRadius: "0px",
                      margin: "0px",
                      cursor: "pointer",
                      borderBottom:
                        index < filteredOptions.length - 1
                          ? "1px solid var(--mantine-color-gray-2)"
                          : "none",
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
          </Combobox.Dropdown>
        </Combobox>
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
