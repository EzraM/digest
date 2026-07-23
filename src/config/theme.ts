import { createTheme, MantineTheme } from "@mantine/core";

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
