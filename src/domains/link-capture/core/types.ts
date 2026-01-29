/**
 * Link capture notification types
 * Used for transient feedback when cmd+clicking links from pages
 */

export interface LinkCaptureNotification {
  id: string;              // Unique ID for this capture
  url: string;             // Captured link URL
  title: string;           // Link title (from page or URL)
  capturedAt: number;      // Timestamp (Date.now())
}

/**
 * Core state for link capture notifications
 */
export interface LinkCaptureState {
  notifications: LinkCaptureNotification[];
}

/**
 * Actions that can be dispatched to modify link capture state
 */
export type LinkCaptureAction =
  | { type: 'CAPTURE'; url: string; title: string }
  | { type: 'DISMISS'; id: string }
  | { type: 'DISMISS_ALL' };
