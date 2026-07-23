import { randomUUID } from "node:crypto";

export type PlacementRecord = {
  placementId: string;
  ownerWindowId: string;
  ownerRendererId: number;
  state: "active" | "retired";
};

/**
 * Process-wide authority for presentation slots. Retired identifiers remain in
 * the registry so they can never be reassigned during the application session.
 */
export class PlacementRegistry {
  private readonly records = new Map<string, PlacementRecord>();

  constructor(
    private readonly createId: () => string = () =>
      `placement-${randomUUID()}`
  ) {}

  register(ownerWindowId: string, ownerRendererId: number): PlacementRecord {
    let placementId = this.createId();
    while (this.records.has(placementId)) {
      placementId = this.createId();
    }
    const record: PlacementRecord = {
      placementId,
      ownerWindowId,
      ownerRendererId,
      state: "active",
    };
    this.records.set(placementId, record);
    return record;
  }

  get(placementId: string): PlacementRecord | undefined {
    return this.records.get(placementId);
  }

  requireOwnedActive(
    placementId: string,
    ownerRendererId: number
  ): PlacementRecord {
    const record = this.records.get(placementId);
    if (!record || record.state !== "active") {
      throw new Error(`Unknown or retired placement: ${placementId}`);
    }
    if (record.ownerRendererId !== ownerRendererId) {
      throw new Error(`Placement is not owned by renderer: ${placementId}`);
    }
    return record;
  }

  retireWindow(ownerWindowId: string): PlacementRecord[] {
    const retired: PlacementRecord[] = [];
    for (const [placementId, record] of this.records) {
      if (record.ownerWindowId !== ownerWindowId || record.state === "retired") {
        continue;
      }
      const next = { ...record, state: "retired" as const };
      this.records.set(placementId, next);
      retired.push(next);
    }
    return retired;
  }
}
