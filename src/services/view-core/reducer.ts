import { ViewWorld, ViewEntry } from "./types";
import { Command } from "./commands";
import { VIEW_LIFECYCLE } from "../../config/viewLifecycle";

export function reduce(world: ViewWorld, cmd: Command): ViewWorld {
  switch (cmd.type) {
    case "create": {
      const now = Date.now();
      const entry: ViewEntry = {
        url: cmd.url,
        bounds: cmd.bounds,
        profile: cmd.profile,
        layout: cmd.layout ?? "inline", // Default to 'inline' for backward compatibility
        status: { type: "loading" },
        refCount: 1, // New view starts with one reference
        lastAccess: now,
        gcCandidate: false,
      };
      return new Map(world).set(cmd.id, entry);
    }

    case "updateBounds": {
      const existing = world.get(cmd.id);
      if (!existing) return world;
      return new Map(world).set(cmd.id, {
        ...existing,
        bounds: cmd.bounds,
        layout: cmd.layout ?? existing.layout,
        lastAccess: Date.now(),
      });
    }

    case "updateUrl": {
      const existing = world.get(cmd.id);
      if (!existing) return world;
      return new Map(world).set(cmd.id, {
        ...existing,
        url: cmd.url,
        lastAccess: Date.now(),
      });
    }

    case "remove": {
      const next = new Map(world);
      next.delete(cmd.id);
      return next;
    }

    case "markLoading": {
      const existing = world.get(cmd.id);
      if (!existing) return world;
      // KEY INSIGHT: Don't override error with loading (prevents the bug!)
      if (existing.status.type === "error") return world;
      return new Map(world).set(cmd.id, {
        ...existing,
        status: { type: "loading" },
      });
    }

    case "markReady": {
      const existing = world.get(cmd.id);
      if (!existing) return world;
      // KEY INSIGHT: Don't override error with ready (the core bug fix!)
      if (existing.status.type === "error") return world;
      return new Map(world).set(cmd.id, {
        ...existing,
        status: { type: "ready", canGoBack: cmd.canGoBack },
      });
    }

    case "markError": {
      const existing = world.get(cmd.id);
      if (!existing) return world;
      return new Map(world).set(cmd.id, {
        ...existing,
        status: { type: "error", code: cmd.code, message: cmd.message },
      });
    }

    case "retry": {
      const existing = world.get(cmd.id);
      if (!existing) return world;
      // Only allow retry from error state
      if (existing.status.type !== "error") return world;
      return new Map(world).set(cmd.id, {
        ...existing,
        status: { type: "loading" },
      });
    }

    case "acquire": {
      const existing = world.get(cmd.id);
      if (!existing) return world;
      const now = Date.now();
      return new Map(world).set(cmd.id, {
        ...existing,
        refCount: existing.refCount + 1,
        lastAccess: now,
        gcCandidate: false, // Clear gcCandidate when view is reacquired
      });
    }

    case "release": {
      const existing = world.get(cmd.id);
      if (!existing) return world;
      const newRefCount = Math.max(0, existing.refCount - 1);
      return new Map(world).set(cmd.id, {
        ...existing,
        refCount: newRefCount,
        gcCandidate: newRefCount === 0, // Mark as GC candidate when refCount reaches 0
      });
    }

    case "gc": {
      const now = Date.now();
      const toRemove: string[] = [];

      for (const [id, entry] of world) {
        if (
          entry.gcCandidate &&
          entry.refCount === 0 &&
          now - entry.lastAccess > VIEW_LIFECYCLE.GC_MAX_AGE_MS
        ) {
          toRemove.push(id);
        }
      }

      // Return new world without the removed entries
      // Interpreter will handle WebContentsView destruction
      if (toRemove.length === 0) {
        return world;
      }

      const next = new Map(world);
      for (const id of toRemove) {
        next.delete(id);
      }
      return next;
    }
  }
}
