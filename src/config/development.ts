// Development configuration
// Controls development-only features like devtools, logging levels, etc.
//
// To enable devtools during development:
// 1. Set the desired devtools flags to `true` below
// 2. Make sure NODE_ENV=development or DEBUG=true in your environment
// 3. Restart the application
//
// Example: To debug the HUD overlay, set `openHudOverlay: true`

export const DEV_CONFIG = {
  // DevTools configuration
  devtools: {
    // Open devtools for the main app window (BlockNote editor)
    openMainWindow: false,

    // Open devtools for the HUD overlay (slash command menu)
    openHudOverlay: false,

    // Open devtools for individual browser WebViews (embedded websites)
    openBrowserViews: false,
  },

  // Logging configuration
  logging: {
    // Enable verbose logging
    verbose: true,

    // Log browser events
    browserEvents: true,
  },

  // Other development features
  features: {
    // Enable hot reload (if implemented)
    hotReload: false,

    // Show performance metrics
    showPerformanceMetrics: false,
  },
} as const;

// Helper function to check if we're in development mode
export const isDevelopment = (): boolean => {
  return process.env.NODE_ENV === "development" || process.env.DEBUG === "true";
};

// Helper function to check if devtools should be enabled for a specific component
export const shouldOpenDevTools = (
  component: keyof typeof DEV_CONFIG.devtools
): boolean => {
  return isDevelopment() && DEV_CONFIG.devtools[component];
};
