export interface Disposable {
  dispose(): void;
}

export class ContributionRegistry {
  private readonly points = new Map<string, Map<string, unknown>>();

  add<T>(point: string, id: string, contribution: T): Disposable {
    let contributions = this.points.get(point);
    if (!contributions) {
      contributions = new Map();
      this.points.set(point, contributions);
    }
    if (contributions.has(id)) {
      throw new Error(`Contribution already registered: ${point}/${id}`);
    }
    contributions.set(id, contribution);
    return {
      dispose: () => {
        contributions?.delete(id);
        if (contributions?.size === 0) this.points.delete(point);
      },
    };
  }

  get<T>(point: string, id: string): T | undefined {
    return this.points.get(point)?.get(id) as T | undefined;
  }

  list<T>(point: string): T[] {
    return [...(this.points.get(point)?.values() ?? [])] as T[];
  }

  clear(): void {
    this.points.clear();
  }
}
