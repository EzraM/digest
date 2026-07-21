import type {
  JourneyCacheDiagnostics,
  OpenReferencePlan,
} from "./BrowsingJourneyStore";

export type CacheMissReason =
  | "no_association"
  | "profile_mismatch"
  | "renderer_unavailable"
  | "attach_failed"
  | "stale_association"
  | "ambiguous";

export type OpenReferenceExecution =
  | {
      type: "reuse-current";
      plan: Extract<OpenReferencePlan, { type: "reuse-current" | "reuse-history" }>;
    }
  | {
      type: "create";
      missReason: CacheMissReason;
      staleHandleId?: string;
    };

export function decideOpenReferenceExecution(
  plan: OpenReferencePlan,
  diagnostics: JourneyCacheDiagnostics,
  reusableHandleAvailable: boolean
): OpenReferenceExecution {
  if (plan.type === "reuse-current" || plan.type === "reuse-history") {
    return reusableHandleAvailable
      ? { type: "reuse-current", plan }
      : {
          type: "create",
          missReason: "renderer_unavailable",
          staleHandleId: plan.handleId,
        };
  }
  if (plan.reason === "matching-journey-visible") {
    return { type: "create", missReason: "ambiguous" };
  }
  return {
    type: "create",
    missReason: diagnostics.hasCrossProfileMatch
      ? "profile_mismatch"
      : "no_association",
  };
}

export function shouldRetainJourney(layout?: "inline" | "full"): boolean {
  return layout === "full";
}
