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
  | {
      type: "updateNavigation";
      id: string;
      url: string;
      canGoBack: boolean;
    }
  | { type: "remove"; id: string }
  | { type: "markLoading"; id: string }
  | { type: "markReady"; id: string }
  | { type: "markError"; id: string; code: number; message: string }
  | { type: "reload"; id: string }
  | { type: "retry"; id: string };
