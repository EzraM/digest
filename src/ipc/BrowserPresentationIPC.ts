import type { OpenReferenceIPCRequest } from "../types/browser";
import type { OpenReferenceCommand } from "../services/ViewStoreContracts";

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function requireString(
  value: UnknownRecord,
  field: keyof OpenReferenceIPCRequest
): string {
  const candidate = value[field];
  if (typeof candidate !== "string" || candidate.length === 0) {
    throw new Error(`Invalid browser presentation field: ${field}`);
  }
  return candidate;
}

function requireGeneration(
  value: UnknownRecord,
  field: "placementGeneration" | "transitionGeneration"
): number {
  const candidate = value[field];
  if (!Number.isSafeInteger(candidate) || (candidate as number) <= 0) {
    throw new Error(`Invalid browser presentation field: ${field}`);
  }
  return candidate as number;
}

function requireBounds(value: unknown): OpenReferenceCommand["bounds"] {
  if (!isRecord(value)) {
    throw new Error("Invalid browser presentation field: bounds");
  }
  const bounds = {
    x: value.x,
    y: value.y,
    width: value.width,
    height: value.height,
  };
  if (
    !Object.values(bounds).every(
      (candidate) => typeof candidate === "number" && Number.isFinite(candidate)
    ) ||
    (bounds.width as number) <= 0 ||
    (bounds.height as number) <= 0
  ) {
    throw new Error("Invalid browser presentation field: bounds");
  }
  return bounds as OpenReferenceCommand["bounds"];
}

/** Validate renderer input once and return the strict main-process command. */
export function parseOpenReferenceCommand(
  input: unknown
): OpenReferenceCommand {
  if (!isRecord(input)) {
    throw new Error("Invalid browser presentation request");
  }

  const layout = input.layout;
  if (layout !== "inline" && layout !== "full") {
    throw new Error("Invalid browser presentation field: layout");
  }
  const referenceKind = input.referenceKind;
  if (
    referenceKind !== "site-block" &&
    referenceKind !== "ephemeral-url"
  ) {
    throw new Error("Invalid browser presentation field: referenceKind");
  }

  return {
    routeId: requireString(input, "routeId"),
    placementId: requireString(input, "viewId"),
    referenceId: requireString(input, "blockId"),
    url: requireString(input, "url"),
    bounds: requireBounds(input.bounds),
    profileId: requireString(input, "profileId"),
    layout,
    referenceKind,
    placementGeneration: requireGeneration(input, "placementGeneration"),
    transitionGeneration: requireGeneration(input, "transitionGeneration"),
  };
}
