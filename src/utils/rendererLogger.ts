export const log = {
  debug: (message: string, context?: string) =>
    console.debug(`[${context || "app"}] ${message}`),
  info: (message: string, context?: string) =>
    console.info(`[${context || "app"}] ${message}`),
  warn: (message: string, context?: string) =>
    console.warn(`[${context || "app"}] ${message}`),
  error: (message: string, context?: string) =>
    console.error(`[${context || "app"}] ${message}`),
};
