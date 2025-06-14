/**
 * Main process logger utility
 * Provides consistent logging interface for the main Electron process
 */

export interface Logger {
  debug: (message: string, context?: string) => void;
  info: (message: string, context?: string) => void;
  warn: (message: string, context?: string) => void;
  error: (message: string, context?: string) => void;
}

class MainLogger implements Logger {
  private formatMessage(
    level: string,
    message: string,
    context?: string
  ): string {
    const timestamp = new Date().toISOString();
    const contextStr = context ? ` [${context}]` : "";
    return `${timestamp} [main] ${level}:${contextStr} ${message}`;
  }

  debug(message: string, context?: string): void {
    console.log(this.formatMessage("debug", message, context));
  }

  info(message: string, context?: string): void {
    console.info(this.formatMessage("info", message, context));
  }

  warn(message: string, context?: string): void {
    console.warn(this.formatMessage("warn", message, context));
  }

  error(message: string, context?: string): void {
    console.error(this.formatMessage("error", message, context));
  }
}

export const log = new MainLogger();
