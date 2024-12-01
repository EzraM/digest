import React, { useState } from "react";
import ReactDOM from "react-dom/client";
import {
  MantineProvider,
  Combobox,
  TextInput,
  useCombobox,
  Highlight,
  Chip,
} from "@mantine/core";
import blockOptions from "./add-blocks.json";
import { log } from "../src/utils/rendererLogger";

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
  const combobox = useCombobox({
    defaultOpened: true,
    // onDropdownClose: () => {
    //   // Prevent dropdown from closing
    //   combobox.openDropdown();
    // },
  });

  // Open dropdown on mount
  // useEffect(() => {
  //   combobox.openDropdown();
  // }, []);

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

  return (
    <MantineProvider>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100vh",
          padding: "0.5rem",
        }}
      >
        <div style={{ flexShrink: 0 }}>
          <TextInput
            placeholder="Search blocks..."
            value={search}
            onChange={(event) => {
              setSearch(event.currentTarget.value);
            }}
          />
        </div>

        <div
          style={{
            flexGrow: 1,
            overflowY: "auto",
            marginTop: "0.5rem",
          }}
        >
          <Combobox store={combobox} onOptionSubmit={handleOptionSelect}>
            <Combobox.Options>
              {filteredOptions.map((option) => (
                <Combobox.Option
                  value={option.key}
                  key={option.key}
                  style={{
                    padding: "6px 12px",
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
                          fontSize: "0.9rem",
                          fontWeight: 500,
                          lineHeight: 1.2,
                        }}
                      >
                        <Highlight
                          highlight={search}
                          highlightStyles={{
                            backgroundColor: "#ff0",
                            padding: 0,
                          }}
                        >
                          {option.title}
                        </Highlight>
                      </div>
                      {option.subtext && (
                        <div
                          style={{
                            fontSize: "0.8rem",
                            color: "#666",
                            lineHeight: 1.2,
                          }}
                        >
                          <Highlight
                            highlight={search}
                            highlightStyles={{
                              backgroundColor: "#ff0",
                              padding: 0,
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
                          backgroundColor: "#f0f0f0",
                        }}
                      >
                        {option.badge}
                      </Chip>
                    )}
                  </div>
                </Combobox.Option>
              ))}
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
