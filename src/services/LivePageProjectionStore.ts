import { LivePagesProjection, LiveReference } from "../types/browser";

function referenceKey(reference: LiveReference): string {
  return `${reference.profileId}\u0000${reference.url}`;
}

function canonicalize(references: LiveReference[]): LiveReference[] {
  const unique = new Map<string, LiveReference>();
  for (const reference of references) {
    unique.set(referenceKey(reference), { ...reference });
  }
  return Array.from(unique.values()).sort((a, b) =>
    referenceKey(a).localeCompare(referenceKey(b))
  );
}

function sameReferences(
  left: LiveReference[],
  right: LiveReference[]
): boolean {
  return (
    left.length === right.length &&
    left.every((reference, index) =>
      referenceKey(reference) === referenceKey(right[index])
    )
  );
}

/** Owns the ordered renderer projection of resumable live pages. */
export class LivePageProjectionStore {
  private projection: LivePagesProjection = {
    revision: 0,
    references: [],
  };

  getSnapshot(): LivePagesProjection {
    return this.projection;
  }

  /** Returns a new projection only when its semantic contents changed. */
  sync(references: LiveReference[]): LivePagesProjection | undefined {
    const nextReferences = canonicalize(references);
    if (sameReferences(this.projection.references, nextReferences)) {
      return undefined;
    }

    this.projection = {
      revision: this.projection.revision + 1,
      references: nextReferences,
    };
    return this.projection;
  }
}
