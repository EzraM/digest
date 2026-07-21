import { RefObject, useEffect } from "react";
import { liveReferenceKey, useLiveReferenceKeys } from "./livePageStore";

const LIVE_ATTRIBUTE = "data-digest-live-page";
const LIVE_DESCRIPTION = "Page is kept live";

/** Decorates BlockNote's ordinary anchors from runtime state only. */
export function useLiveInlineLinkIndicators(
  rootRef: RefObject<HTMLElement>,
  profileId: string
): void {
  const liveReferenceKeys = useLiveReferenceKeys();

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const update = () => {
      for (const anchor of root.querySelectorAll<HTMLAnchorElement>("a[href]")) {
        const isLive = liveReferenceKeys.has(
          liveReferenceKey(profileId, anchor.href)
        );
        if (isLive) {
          anchor.setAttribute(LIVE_ATTRIBUTE, "true");
          anchor.setAttribute("aria-description", LIVE_DESCRIPTION);
          anchor.setAttribute("title", LIVE_DESCRIPTION);
        } else if (anchor.hasAttribute(LIVE_ATTRIBUTE)) {
          anchor.removeAttribute(LIVE_ATTRIBUTE);
          anchor.removeAttribute("aria-description");
          if (anchor.getAttribute("title") === LIVE_DESCRIPTION) {
            anchor.removeAttribute("title");
          }
        }
      }
    };

    update();
    const observer = new MutationObserver(update);
    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["href"],
    });
    return () => observer.disconnect();
  }, [liveReferenceKeys, profileId, rootRef]);
}
