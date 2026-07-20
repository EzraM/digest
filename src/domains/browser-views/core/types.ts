export type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type LoadState =
  | { type: "idle" }
  | { type: "loading" }
  | { type: "ready" }
  | { type: "error"; code: number; message: string };

export type ViewEntry = {
  url: string;
  history: {
    canGoBack: boolean;
  };
  bounds: Rect;
  profile: string;
  layout: "inline" | "full";
  loadState: LoadState;
};

export type ViewWorld = ReadonlyMap<string, ViewEntry>;

export const emptyWorld: ViewWorld = new Map();
