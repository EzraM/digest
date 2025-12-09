import { Rect } from "./types";

export type Command =
  | {
      type: "create";
      id: string;
      url: string;
      bounds: Rect;
      profile: string;
      layout?: "inline" | "full";
    }
  | { type: "updateBounds"; id: string; bounds: Rect }
  | { type: "updateUrl"; id: string; url: string }
  | { type: "remove"; id: string } // Explicit removal (block deleted)
  | { type: "acquire"; id: string } // Component wants view
  | { type: "release"; id: string } // Component done with view
  | { type: "gc" } // Run garbage collection
  | { type: "markLoading"; id: string }
  | { type: "markReady"; id: string; canGoBack: boolean }
  | { type: "markError"; id: string; code: number; message: string }
  | { type: "retry"; id: string };
