import { getEnvVar, isDevelopment } from "./environment";

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
export { isDevelopment };

// Helper function to check if devtools should be enabled for a specific component
export const shouldOpenDevTools = (
  component: keyof typeof DEV_CONFIG.devtools
): boolean => {
  return isDevelopment() && DEV_CONFIG.devtools[component];
};

// Helper function to get API key with proper fallback priority:
// 1. ANTHROPIC_API_KEY environment variable (highest priority)
// 2. .env.local file
// 3. Empty string (fallback mode)
export const getAnthropicApiKey = (): string => {
  const apiKey = getEnvVar("ANTHROPIC_API_KEY");

  if (!apiKey) {
    console.log(
      "[development] No ANTHROPIC_API_KEY found. Intelligent URL processing will use fallback mode."
    );
    console.log("[development] To enable AI features:");
    console.log(
      "[development]   1. Create a .env.local file in the project root"
    );
    console.log("[development]   2. Add: ANTHROPIC_API_KEY=your-api-key-here");
    console.log("[development]   3. Restart the application");
  }

  return apiKey;
};
