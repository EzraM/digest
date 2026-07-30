import { WindowRegistry } from "../../application/WindowRegistry";
import { IPCHandlerMap } from "../IPCRouter";

type OpenWindow = (
  initialHash?: string,
  initialDocumentId?: string | null
) => Promise<void>;

type WindowRoute = {
  kind?: unknown;
  url?: unknown;
  documentId?: unknown;
  sourceBlockId?: unknown;
  fallbackLinkLabel?: unknown;
};

export const windowRouteHash = (input: unknown): string => {
  if (!input || typeof input !== "object") {
    throw new Error("Invalid Digest window route");
  }

  const route = input as WindowRoute;
  if (route.kind === "doc" && typeof route.documentId === "string") {
    return `#/doc/${encodeURIComponent(route.documentId)}`;
  }
  if (route.kind !== "url" || typeof route.url !== "string") {
    throw new Error("Invalid Digest window route");
  }

  const query = new URLSearchParams();
  if (typeof route.documentId === "string") {
    query.set("doc", route.documentId);
  }
  if (typeof route.sourceBlockId === "string") {
    query.set("source", route.sourceBlockId);
  }
  if (typeof route.fallbackLinkLabel === "string") {
    query.set("label", route.fallbackLinkLabel.slice(0, 240));
  }
  const suffix = query.size ? `?${query.toString()}` : "";
  return `#/url/${encodeURIComponent(route.url)}${suffix}`;
};

export function createWindowHandlers(
  windowRegistry: WindowRegistry,
  openWindow: OpenWindow
): IPCHandlerMap {
  return {
    "windows:open-route": {
      type: "invoke",
      fn: async (event, input: unknown) => {
        if (!windowRegistry.resolve(event.sender)) {
          throw new Error("Unknown Digest renderer");
        }

        const hash = windowRouteHash(input);
        const route = input as WindowRoute;
        const existingWindowIds = new Set(
          windowRegistry.list().map((session) => session.windowId)
        );

        await openWindow(
          hash,
          typeof route.documentId === "string" ? route.documentId : null
        );

        const created = windowRegistry
          .list()
          .find((session) => !existingWindowIds.has(session.windowId));
        return { windowId: created?.windowId ?? "" };
      },
    },
  };
}
