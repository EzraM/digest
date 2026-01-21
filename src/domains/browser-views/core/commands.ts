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
  | {
      type: "updateBounds";
      id: string;
      bounds: Rect;
      layout?: "inline" | "full";
    }
  | { type: "updateUrl"; id: string; url: string }
  | { type: "remove"; id: string }
  | { type: "markLoading"; id: string }
  | { type: "markReady"; id: string; canGoBack: boolean }
  | { type: "markError"; id: string; code: number; message: string }
  | { type: "retry"; id: string };
