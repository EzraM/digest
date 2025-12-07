/**
 * BrowserErrorHandler
 *
 * Categorizes and formats browser loading errors for user-friendly display
 */

export interface CategorizedError {
  errorCategory: string;
  userMessage: string;
  technicalDetails: string;
  canRetry: boolean;
}

/**
 * Categorizes Chromium error codes into user-friendly error messages
 *
 * @param errorCode - Chromium error code (negative integer)
 * @param errorDescription - Technical error description from Chromium
 * @param validatedURL - The URL that failed to load
 * @returns Categorized error information for display
 */
export function categorizeBrowserError(
  errorCode: number,
  errorDescription: string,
  validatedURL: string
): CategorizedError {
  // Common Chromium error codes
  // See: https://source.chromium.org/chromium/chromium/src/+/main:net/base/net_error_list.h

  // Network connectivity errors
  if (errorCode === -2) {
    return {
      errorCategory: "network",
      userMessage:
        "Cannot connect to this website. Please check your internet connection.",
      technicalDetails: `Failed to resolve DNS for ${validatedURL}`,
      canRetry: true,
    };
  }

  // Timeout errors (check before SSL range to avoid conflicts)
  if (errorCode === -7 || errorCode === -21 || errorCode === -118) {
    return {
      errorCategory: "network",
      userMessage:
        "Connection timed out. The website is taking too long to respond.",
      technicalDetails: `${errorDescription} (${errorCode}) for ${validatedURL}`,
      canRetry: true,
    };
  }

  // Connection errors
  if (errorCode === -100 || errorCode === -101 || errorCode === -102) {
    return {
      errorCategory: "network",
      userMessage:
        "Cannot reach this website. The connection was refused or timed out.",
      technicalDetails: `${errorDescription} (${errorCode}) for ${validatedURL}`,
      canRetry: true,
    };
  }

  // Aborted/Cancelled (check before SSL range)
  if (errorCode === -3) {
    return {
      errorCategory: "aborted",
      userMessage: "Loading was cancelled.",
      technicalDetails: `${errorDescription} (${errorCode})`,
      canRetry: true,
    };
  }

  // SSL/Certificate errors (range check, but exclude already handled codes)
  if (errorCode >= -200 && errorCode <= -100 && errorCode !== -118) {
    return {
      errorCategory: "security",
      userMessage:
        "Security certificate error. This website's certificate is not trusted.",
      technicalDetails: `SSL error (${errorCode}): ${errorDescription} for ${validatedURL}`,
      canRetry: false,
    };
  }

  // Invalid URL
  if (errorCode === -300 || errorCode === -301) {
    return {
      errorCategory: "invalid-url",
      userMessage: "Invalid website address. Please check the URL.",
      technicalDetails: `${errorDescription} (${errorCode}): ${validatedURL}`,
      canRetry: false,
    };
  }

  // HTTP errors (4xx, 5xx)
  if (errorCode === -324) {
    return {
      errorCategory: "http",
      userMessage:
        "Website returned an error. The page may not exist or the server is having issues.",
      technicalDetails: `${errorDescription} (${errorCode}) for ${validatedURL}`,
      canRetry: true,
    };
  }

  // Process crash (custom error code)
  if (errorCode === -999 || errorDescription.includes("ERR_PROCESS_CRASHED")) {
    return {
      errorCategory: "crash",
      userMessage:
        "The page crashed. This may be due to a problem with the website or your system.",
      technicalDetails: `Process crashed: ${errorDescription} (${errorCode}) for ${validatedURL}`,
      canRetry: true,
    };
  }

  // Unresponsive process
  if (errorDescription.includes("ERR_PROCESS_UNRESPONSIVE")) {
    return {
      errorCategory: "timeout",
      userMessage:
        "The page became unresponsive. It may be taking too long to load or has stopped responding.",
      technicalDetails: `Process unresponsive: ${errorDescription} (${errorCode}) for ${validatedURL}`,
      canRetry: true,
    };
  }

  // Generic/Unknown errors
  return {
    errorCategory: "unknown",
    userMessage: "Failed to load website. Please try again.",
    technicalDetails: `${errorDescription} (${errorCode}) for ${validatedURL}`,
    canRetry: true,
  };
}
