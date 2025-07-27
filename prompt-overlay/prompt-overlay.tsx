/// <reference types="../src/types/electron" />
import React, { useEffect, useState, useRef } from "react";
import ReactDOM from "react-dom/client";
import { MantineProvider, Textarea, Button, Box, Badge } from "@mantine/core";
import { log } from "../src/utils/rendererLogger";
import { useCostTracking } from "./useCostTracking";
import { useAIAvailability } from "./useAIAvailability";
import { CostDisplay } from "./CostDisplay";

// Custom theme for better styling
const theme = {
  components: {
    Textarea: {
      styles: {
        input: {
          fontSize: "14px",
          borderRadius: "8px",
          border: "1px solid #e0e0e0",
        },
      },
    },
    Button: {
      styles: {
        root: {
          borderRadius: "8px",
        },
      },
    },
  },
};

const App = () => {
  const [prompt, setPrompt] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Use the cost tracking hook
  const { costData, hasCostData } = useCostTracking();

  // Use the AI availability hook
  const { isAvailable, isLoading: isCheckingAvailability } =
    useAIAvailability();

  const handleSubmit = async () => {
    if (!prompt.trim() || isLoading || !isAvailable) return;

    setIsLoading(true);
    log.debug(`Submitting prompt: "${prompt}"`, "prompt-overlay");

    try {
      if ((window as any).electronAPI?.submitPrompt) {
        const result = await (window as any).electronAPI.submitPrompt(
          prompt.trim()
        );
        log.debug(
          `Prompt processing result: ${JSON.stringify(result)}`,
          "prompt-overlay"
        );

        // Clear the prompt after successful submission
        if (result.success) {
          setPrompt("");
        }
      }
    } catch (error) {
      log.debug(`Error submitting prompt: ${error}`, "prompt-overlay");
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // Focus the textarea on mount
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  }, []);

  // Listen for focus requests from main process
  useEffect(() => {
    const handleFocusRequest = () => {
      log.debug("Received focus request from main process", "prompt-overlay");
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.select(); // Also select all text for quick replacement
      }
    };

    // Listen for focus messages from main process
    if ((window as any).electronAPI?.onFocusRequest) {
      return (window as any).electronAPI.onFocusRequest(handleFocusRequest);
    }
  }, []);

  return (
    <MantineProvider theme={theme}>
      <Box
        style={{
          margin: "0",
          padding: "0",
          backgroundColor: "rgba(255, 255, 255, 0.98)",
          border: "none",
          borderRadius: "0",
          backdropFilter: "blur(16px)",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <Box
          style={{
            padding: "12px",
            height: "100%",
            border: "2px solid #e0e0e0",
            boxSizing: "border-box",
            display: "grid",
            gridTemplateRows: "1fr auto",
            gap: "8px",
          }}
        >
          <Textarea
            ref={textareaRef}
            placeholder={
              isCheckingAvailability
                ? "Checking AI availability..."
                : isAvailable
                ? "Describe what you're looking for or enter a url..."
                : "AI processing not available"
            }
            value={prompt}
            onChange={(event) => setPrompt(event.currentTarget.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading || !isAvailable}
            size="md"
            style={{
              width: "100%",
              minHeight: "0",
            }}
            styles={{
              wrapper: {
                height: "100%",
                display: "flex",
                flexDirection: "column",
              },
              input: {
                border: "none",
                background: "transparent",
                fontSize: "14px",
                resize: "none",
                height: "100%",
                "&:focus": {
                  borderColor: "transparent",
                  outline: "none",
                },
              },
            }}
          />

          <Box
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              borderTop: "1px solid #f0f0f0",
              paddingTop: "8px",
              height: "36px",
            }}
          >
            <CostDisplay
              queryCost={costData.queryCost}
              sessionTotal={costData.sessionTotal}
              hasCostData={hasCostData}
            />

            <Box style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Badge
                variant="light"
                color="gray"
                size="sm"
                style={{ fontSize: "10px", fontWeight: "normal" }}
              >
                ⌘↵
              </Badge>
              <Button
                onClick={handleSubmit}
                disabled={!prompt.trim() || isLoading || !isAvailable}
                loading={isLoading}
                size="sm"
                color="blue"
                style={{
                  minWidth: "60px",
                  fontSize: "12px",
                  height: "28px",
                }}
              >
                Run
              </Button>
            </Box>
          </Box>
        </Box>
      </Box>
    </MantineProvider>
  );
};

// Create root only if it doesn't exist to prevent the duplicate root warning
const rootElement = document.getElementById("root")!;
let root = (rootElement as any)._reactRoot;

if (!root) {
  root = ReactDOM.createRoot(rootElement);
  (rootElement as any)._reactRoot = root;
  log.debug("Created new React root for prompt overlay", "prompt-overlay");
} else {
  log.debug("Reusing existing React root for prompt overlay", "prompt-overlay");
}

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
