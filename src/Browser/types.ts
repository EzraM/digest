// Props interfaces
export interface PageProps {
  blockId: string;
  url: string;
  heightMode?: "normal" | "expanded";
}

export type BrowserInitStatus =
  | { state: "idle" }
  | { state: "initializing"; detail?: "created" | "existing" | "loaded" }
  | { state: "initialized" }
  | { state: "error"; error: BrowserInitError };

export interface BrowserSlotProps {
  blockId: string;
  onBoundsChange?: (bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  }) => void;
  initStatus: BrowserInitStatus;
  onRetry?: () => void;
}

export interface BrowserInitError {
  friendlyTitle: string;
  friendlySubtitle?: string;
  technicalMessage?: string;
  code?: number;
  description?: string;
  url?: string;
}
