// Props interfaces
export interface PageProps {
  blockId: string;
  url: string;
}

export interface BrowserSlotProps {
  blockId: string;
  onBoundsChange?: (bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  }) => void;
  isInitialized?: boolean;
  initError?: BrowserInitError | null;
  initStatus?: string | null;
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
