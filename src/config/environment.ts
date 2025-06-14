import * as fs from "fs";
import * as path from "path";

/**
 * Simple environment variable loader for Electron
 * Loads from .env.local file if it exists, without requiring dotenv package
 */

interface EnvVars {
  [key: string]: string;
}

let envCache: EnvVars | null = null;

/**
 * Load environment variables from .env.local file
 */
function loadEnvFile(): EnvVars {
  if (envCache !== null) {
    return envCache;
  }

  const envVars: EnvVars = {};

  // Try to load .env.local from project root
  const envPath = path.join(process.cwd(), ".env.local");

  try {
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, "utf8");

      // Parse simple KEY=VALUE format
      const lines = envContent.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();

        // Skip empty lines and comments
        if (!trimmed || trimmed.startsWith("#")) {
          continue;
        }

        // Parse KEY=VALUE
        const equalIndex = trimmed.indexOf("=");
        if (equalIndex > 0) {
          const key = trimmed.substring(0, equalIndex).trim();
          let value = trimmed.substring(equalIndex + 1).trim();

          // Remove quotes if present
          if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
          ) {
            value = value.slice(1, -1);
          }

          envVars[key] = value;
        }
      }

      console.log(
        `[environment] Loaded ${
          Object.keys(envVars).length
        } variables from .env.local`
      );
    }
  } catch (error) {
    console.warn(`[environment] Could not load .env.local: ${error}`);
  }

  envCache = envVars;
  return envVars;
}

/**
 * Get an environment variable with fallback priority:
 * 1. Process environment variables (highest priority)
 * 2. .env.local file
 * 3. Default value (if provided)
 */
export function getEnvVar(key: string, defaultValue?: string): string {
  // First check process environment
  if (process.env[key]) {
    return process.env[key]!;
  }

  // Then check .env.local file
  const envVars = loadEnvFile();
  if (envVars[key]) {
    return envVars[key];
  }

  // Finally return default
  return defaultValue || "";
}

/**
 * Check if we're in development mode
 */
export function isDevelopment(): boolean {
  return process.env.NODE_ENV === "development" || process.env.DEBUG === "true";
}

/**
 * Get all loaded environment variables (for debugging)
 */
export function getLoadedEnvVars(): EnvVars {
  return { ...loadEnvFile() };
}
