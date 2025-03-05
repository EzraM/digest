import winston from "winston";

const logger = winston.createLogger({
  level: "debug",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ level, message, timestamp, context }) => {
      return `${timestamp} [${context || "app"}] ${level}: ${message}`;
    })
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: "electron-app.log" }),
  ],
});

export const log = {
  debug: (message: string, context?: string) =>
    logger.debug(message, { context }),
  info: (message: string, context?: string) =>
    logger.info(message, { context }),
  warn: (message: string, context?: string) =>
    logger.warn(message, { context }),
  error: (message: string, context?: string) =>
    logger.error(message, { context }),
};
