import { createTheme, MantineTheme } from "@mantine/core";

/**
 * Sidebar button color definitions for light and dark modes
 */
export const sidebarButtonColors = {
  // Navigation button (opens/closes sidebar to access notebooks) - Blue theme
  navigation: {
    light: {
      background: "#e7f5ff", // blue[0]
      hover: "#d0ebff", // blue[1]
      text: "#1c7ed6", // blue[7]
      border: "#e0e0e0",
    },
    dark: {
      background: "#1e3a5f", // dark blue
      hover: "#2a4a6f", // slightly lighter blue
      text: "#74c0fc", // blue[4]
      border: "#373A40", // dark[4]
    },
  },
  // Return to notebook - violet represents reflection and synthesis
  close: {
    light: {
      background: "#f3f0ff",
      hover: "#e8e1ff",
      text: "#7656d6",
      border: "#e0e0e0",
    },
    dark: {
      background: "#30284a",
      hover: "#3d325f",
      text: "#b9a7f5",
      border: "#373A40",
    },
  },
  // Browser history - ultramarine represents links and movement through the web
  browserBack: {
    light: {
      background: "#eef2ff",
      hover: "#dde5ff",
      text: "#315efb",
      border: "#e0e0e0",
    },
    dark: {
      background: "#222d52",
      hover: "#2b3968",
      text: "#91a8ff",
      border: "#373A40",
    },
  },
};

/**
 * Custom Mantine theme with tighter spacing for a more compact,
 * terminal-like aesthetic similar to the debug toolbar.
 *
 * This theme reduces spacing throughout the app while maintaining
 * readability and usability.
 */
export const theme = createTheme({
  // Reduce spacing scale for tighter layouts
  // Default Mantine spacing: xs: 10px, sm: 12px, md: 16px, lg: 20px, xl: 32px
  spacing: {
    xs: "4px", // was 10px
    sm: "8px", // was 12px
    md: "12px", // was 16px
    lg: "16px", // was 20px
    xl: "20px", // was 32px
  },

  // Component-specific styling for tighter spacing
  components: {
    // Tighter line height for more compact text
    Text: {
      styles: {
        root: {
          lineHeight: 1.4,
        },
      },
    },

    // Reduce default gaps in Stack and Group
    Stack: {
      defaultProps: {
        gap: "xs",
      },
    },
    Group: {
      defaultProps: {
        gap: "xs",
      },
    },

    // More compact cards
    Card: {
      styles: {
        root: {
          padding: "12px",
        },
      },
    },

    // Tighter modal spacing
    Modal: {
      styles: {
        content: {
          padding: "16px",
        },
        header: {
          padding: "12px 16px",
          marginBottom: "8px",
        },
        body: {
          padding: "0",
        },
      },
    },

    // More compact inputs
    Input: {
      styles: {
        input: {
          padding: "4px 8px",
          fontSize: "13px",
          minHeight: "28px",
          height: "auto",
        },
      },
    },

    // Tighter badges
    Badge: {
      styles: {
        root: {
          padding: "2px 6px",
          fontSize: "11px",
          height: "auto",
          minHeight: "18px",
        },
      },
    },

    // Reduced divider margins
    Divider: {
      styles: {
        root: {
          marginTop: "8px",
          marginBottom: "8px",
        },
      },
    },

    // Tighter scroll area padding
    ScrollArea: {
      styles: {
        viewport: {
          padding: "4px",
        },
      },
    },

    // More compact buttons (but don't force size, just reduce padding)
    Button: {
      styles: (_theme: MantineTheme, props: any) => ({
        root: {
          // Only reduce padding for xs size buttons to match debug toolbar
          ...(props.size === "xs" && {
            padding: "4px 8px",
            fontSize: "12px",
            height: "auto",
            minHeight: "24px",
          }),
        },
      }),
    },
  },
});
