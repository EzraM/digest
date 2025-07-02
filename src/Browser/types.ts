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
  initError?: string | null;
  initStatus?: string | null;
  onRetry?: () => void;
}
