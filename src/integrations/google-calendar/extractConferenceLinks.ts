export type ConferenceProvider =
  | "zoom"
  | "google-meet"
  | "teams"
  | "webex"
  | "unknown";

export interface ConferenceLink {
  provider: ConferenceProvider;
  url: string;
  source: "conference-entry-point" | "hangout-link" | "location" | "description";
  confidence: number;
}

export interface GoogleCalendarEventLike {
  conferenceData?: {
    entryPoints?: Array<{ entryPointType?: string; uri?: string }>;
  };
  hangoutLink?: string;
  location?: string;
  description?: string;
}

const URL_PATTERN = /https?:\/\/[^\s<>()]+/gi;

const providerFor = (url: string): ConferenceProvider => {
  const hostname = new URL(url).hostname.toLowerCase();
  if (hostname === "zoom.us" || hostname.endsWith(".zoom.us")) return "zoom";
  if (hostname === "meet.google.com") return "google-meet";
  if (hostname === "teams.microsoft.com") return "teams";
  if (hostname === "webex.com" || hostname.endsWith(".webex.com")) return "webex";
  return "unknown";
};

const normalize = (url: string): string | null => {
  try {
    const parsed = new URL(url.replace(/[.,;]+$/, ""));
    return parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
};

export const extractConferenceLinks = (
  event: GoogleCalendarEventLike
): ConferenceLink[] => {
  const links = new Map<string, ConferenceLink>();
  const add = (url: string | undefined, source: ConferenceLink["source"], confidence: number) => {
    if (!url) return;
    const normalized = normalize(url);
    if (!normalized) return;
    const provider = providerFor(normalized);
    if (provider === "unknown" && source !== "conference-entry-point") return;
    const existing = links.get(normalized);
    if (!existing || existing.confidence < confidence) {
      links.set(normalized, { provider, url: normalized, source, confidence });
    }
  };

  for (const entryPoint of event.conferenceData?.entryPoints ?? []) {
    if (entryPoint.entryPointType === "video") {
      add(entryPoint.uri, "conference-entry-point", 1);
    }
  }
  add(event.hangoutLink, "hangout-link", 1);
  for (const url of event.location?.match(URL_PATTERN) ?? []) add(url, "location", 0.8);
  for (const url of event.description?.match(URL_PATTERN) ?? []) add(url, "description", 0.6);

  return [...links.values()].sort((a, b) => b.confidence - a.confidence);
};
