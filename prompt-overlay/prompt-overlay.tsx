import React, { useEffect, useState, useRef } from "react";
import ReactDOM from "react-dom/client";
import { MantineProvider, Textarea, Button, Box, Text } from "@mantine/core";
import { log } from "../src/utils/rendererLogger";

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
  const [isAvailable, setIsAvailable] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Check if intelligent URL processing is available
  useEffect(() => {
    const checkAvailability = async () => {
      try {
        if (window.electronAPI?.isIntelligentUrlAvailable) {
          const available =
            await window.electronAPI.isIntelligentUrlAvailable();
          setIsAvailable(available);
          log.debug(
            `Intelligent URL processing available: ${available}`,
            "prompt-overlay"
          );
        }
      } catch (error) {
        log.debug(`Error checking availability: ${error}`, "prompt-overlay");
        setIsAvailable(false);
      }
    };

    checkAvailability();
  }, []);

  const handleSubmit = async () => {
    if (!prompt.trim() || isLoading || !isAvailable) return;

    setIsLoading(true);
    log.debug(`Submitting prompt: "${prompt}"`, "prompt-overlay");

    try {
      if (window.electronAPI?.submitPrompt) {
        const result = await window.electronAPI.submitPrompt(prompt.trim());
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

  return (
    <MantineProvider theme={theme}>
      <Box
        style={{
          padding: "12px",
          backgroundColor: "rgba(255, 255, 255, 0.95)",
          border: "1px solid #e0e0e0",
          borderRadius: "12px",
          boxShadow: "0 4px 20px rgba(0, 0, 0, 0.1)",
          backdropFilter: "blur(8px)",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          gap: "8px",
        }}
      >
        <Textarea
          ref={textareaRef}
          placeholder={
            isAvailable
              ? "Enter URL or describe what you're looking for..."
              : "AI processing not available"
          }
          value={prompt}
          onChange={(event) => setPrompt(event.currentTarget.value)}
          onKeyDown={handleKeyDown}
          disabled={isLoading || !isAvailable}
          autosize
          minRows={1}
          maxRows={2}
          size="sm"
          styles={{
            input: {
              border: "none",
              background: "transparent",
              fontSize: "14px",
              resize: "none",
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
          }}
        >
          <Text
            size="xs"
            c="dimmed"
            style={{
              fontSize: "11px",
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}
          >
            <span>⌘</span>
            <span>+</span>
            <span>↵</span>
            <span>to submit</span>
          </Text>

          <Button
            onClick={handleSubmit}
            disabled={!prompt.trim() || isLoading || !isAvailable}
            loading={isLoading}
            size="xs"
            color="blue"
            style={{
              minWidth: "60px",
              fontSize: "11px",
            }}
          >
            {isLoading ? (
              ""
            ) : (
              <Box
                style={{ display: "flex", alignItems: "center", gap: "4px" }}
              >
                <span style={{ fontSize: "10px" }}>⌘</span>
                <span style={{ fontSize: "10px" }}>↵</span>
              </Box>
            )}
          </Button>
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
