import { ViewWorld, ViewEntry } from "./types";
import { Command } from "./commands";

export function reduce(world: ViewWorld, cmd: Command): ViewWorld {
  switch (cmd.type) {
    case "create": {
      const entry: ViewEntry = {
        url: cmd.url,
        bounds: cmd.bounds,
        profile: cmd.profile,
        layout: cmd.layout ?? "inline", // Default to 'inline' for backward compatibility
        status: { type: "loading" },
      };
      return new Map(world).set(cmd.id, entry);
    }

    case "updateBounds": {
      const existing = world.get(cmd.id);
      if (!existing) return world;
      return new Map(world).set(cmd.id, { ...existing, bounds: cmd.bounds });
    }

    case "updateUrl": {
      const existing = world.get(cmd.id);
      if (!existing) return world;
      return new Map(world).set(cmd.id, { ...existing, url: cmd.url });
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
  }
}
