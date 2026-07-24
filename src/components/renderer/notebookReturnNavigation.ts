type RouterHistoryState = {
  __TSR_index?: unknown;
} | null;

export function hasPreviousDigestRoute(state: RouterHistoryState): boolean {
  return (
    typeof state?.__TSR_index === "number" &&
    state.__TSR_index > 0
  );
}

