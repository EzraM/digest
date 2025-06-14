// Helper to forward logs to main process if available
const forwardToMain = (level: string, message: string, context?: string) => {
  if (typeof window !== "undefined" && window.electronAPI?.forwardLog) {
    window.electronAPI.forwardLog({
      level: level,
      message: message,
      timestamp: new Date().toISOString(),
      source: context || "renderer",
    });
  }
};

export const log = {
  debug: (message: string, context?: string) => {
    console.debug(`[${context || "app"}] ${message}`);
    forwardToMain("debug", message, context);
  },
  info: (message: string, context?: string) => {
    console.info(`[${context || "app"}] ${message}`);
    forwardToMain("info", message, context);
  },
  warn: (message: string, context?: string) => {
    console.warn(`[${context || "app"}] ${message}`);
    forwardToMain("warn", message, context);
  },
  error: (message: string, context?: string) => {
    console.error(`[${context || "app"}] ${message}`);
    forwardToMain("error", message, context);
  },
};
