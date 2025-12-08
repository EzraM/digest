export type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ViewStatus =
  | { type: "idle" }
  | { type: "loading" }
  | { type: "ready"; canGoBack: boolean }
  | { type: "error"; code: number; message: string };

export type ViewEntry = {
  url: string;
  bounds: Rect;
  profile: string;
  layout: "inline" | "full";
  status: ViewStatus;
};

export type ViewWorld = ReadonlyMap<string, ViewEntry>;

export const emptyWorld: ViewWorld = new Map();
