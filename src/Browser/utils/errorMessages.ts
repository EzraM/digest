import { BrowserInitError } from "../types";

type KnownErrorEntry = {
  friendlyTitle: string;
  friendlySubtitle?: string;
};

type ErrorIdentifier = number | string;

const KNOWN_ERRORS: Record<ErrorIdentifier, KnownErrorEntry> = {
  // Network and DNS issues
  [-105]: {
    friendlyTitle: "We couldn't find that site.",
    friendlySubtitle:
      "Please check the address for typos or make sure you're connected to the internet.",
  },
  [-106]: {
    friendlyTitle: "It looks like you're offline.",
    friendlySubtitle: "Reconnect to the internet and try loading the page again.",
  },
  [-102]: {
    friendlyTitle: "The server refused the connection.",
    friendlySubtitle:
      "The site might be down or blocking connections. Try again in a little bit.",
  },
  [-118]: {
    friendlyTitle: "The request timed out.",
    friendlySubtitle:
      "The site took too long to respond. You can retry or check your connection.",
  },
  ERR_NAME_NOT_RESOLVED: {
    friendlyTitle: "We couldn't find that site.",
    friendlySubtitle:
      "Please check the address for typos or make sure you're connected to the internet.",
  },
  ERR_CONNECTION_REFUSED: {
    friendlyTitle: "The site refused the connection.",
    friendlySubtitle:
      "The server might be busy or not accepting requests right now. Please try again later.",
  },
  ERR_CONNECTION_TIMED_OUT: {
    friendlyTitle: "The request timed out.",
    friendlySubtitle:
      "The site took too long to respond. You can retry or check your connection.",
  },
  ERR_INTERNET_DISCONNECTED: {
    friendlyTitle: "It looks like you're offline.",
    friendlySubtitle: "Reconnect to the internet and try loading the page again.",
  },
  ERR_NAME_RESOLUTION_FAILED: {
    friendlyTitle: "We couldn't find that site.",
    friendlySubtitle:
      "Please check the address for typos or make sure you're connected to the internet.",
  },
  "invalid-url": {
    friendlyTitle: "That address doesn't look quite right.",
    friendlySubtitle:
      "Double-check the link and try again with a full URL including https://.",
  },
  "INVALID-URL": {
    friendlyTitle: "That address doesn't look quite right.",
    friendlySubtitle:
      "Double-check the link and try again with a full URL including https://.",
  },
};

const DEFAULT_ERROR: KnownErrorEntry = {
  friendlyTitle: "We couldn't load this page.",
  friendlySubtitle: "You can retry or open the site in your browser.",
};

function normalizeDescription(description?: string) {
  return description?.toUpperCase().trim();
}

export function buildBrowserInitError(options: {
  code?: number;
  description?: string;
  url?: string;
  rawMessage?: string | null;
}): BrowserInitError {
  const normalizedDescription = normalizeDescription(options.description);

  const friendlyEntry =
    (typeof options.code === "number" && KNOWN_ERRORS[options.code]) ||
    (normalizedDescription && KNOWN_ERRORS[normalizedDescription]) ||
    (options.description && KNOWN_ERRORS[options.description]) ||
    DEFAULT_ERROR;

  const technicalParts: string[] = [];
  if (options.rawMessage) {
    technicalParts.push(options.rawMessage);
  } else if (options.description) {
    technicalParts.push(options.description);
  }

  if (typeof options.code === "number") {
    technicalParts.push(`Error code: ${options.code}`);
  }

  if (options.url) {
    technicalParts.push(`URL: ${options.url}`);
  }

  return {
    friendlyTitle: friendlyEntry.friendlyTitle,
    friendlySubtitle: friendlyEntry.friendlySubtitle,
    technicalMessage: technicalParts.length > 0 ? technicalParts.join("\n") : undefined,
    code: options.code,
    description: options.description,
    url: options.url,
  };
}
