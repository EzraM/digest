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
