export type LivePageStatus = "visible" | "cached";

export type LivePageEntry = {
  viewId: string;
  blockId: string;
  status: LivePageStatus;
  lastUsedAt: number;
};

/**
 * Tracks bounded ownership of live browser views. Electron handles remain owned
 * by ViewStore; this class only decides membership, recency, and eviction.
 */
export class LivePageCache {
  private entries = new Map<string, LivePageEntry>();
  private clock = 0;

  constructor(private readonly limit = 10) {}

  addVisible(viewId: string, blockId: string): string[] {
    this.entries.set(viewId, {
      viewId,
      blockId,
      status: "visible",
      lastUsedAt: this.nextTimestamp(),
    });
    return this.enforceLimit();
  }

  markVisible(viewId: string): void {
    const entry = this.entries.get(viewId);
    if (!entry) return;
    entry.status = "visible";
    entry.lastUsedAt = this.nextTimestamp();
  }

  markCached(viewId: string): string[] {
    const entry = this.entries.get(viewId);
    if (!entry) return [];
    entry.status = "cached";
    entry.lastUsedAt = this.nextTimestamp();
    return this.enforceLimit();
  }

  remove(viewId: string): boolean {
    return this.entries.delete(viewId);
  }

  has(viewId: string): boolean {
    return this.entries.has(viewId);
  }

  isCached(viewId: string): boolean {
    return this.entries.get(viewId)?.status === "cached";
  }

  getLiveBlockIds(): string[] {
    return Array.from(
      new Set(Array.from(this.entries.values(), (entry) => entry.blockId))
    );
  }

  private enforceLimit(): string[] {
    const evicted: string[] = [];

    while (this.entries.size > this.limit) {
      const candidate = Array.from(this.entries.values())
        .filter((entry) => entry.status === "cached")
        .sort((a, b) => a.lastUsedAt - b.lastUsedAt)[0];

      // A visible page is never evicted. The cache can be temporarily above its
      // limit until one of the visible entries is detached.
      if (!candidate) break;

      this.entries.delete(candidate.viewId);
      evicted.push(candidate.viewId);
    }

    return evicted;
  }

  private nextTimestamp(): number {
    this.clock += 1;
    return this.clock;
  }
}
