/**
 * Link Capture Domain - Public API
 *
 * This domain handles capturing links from browser pages and displaying
 * transient notifications when links are inserted into the notebook.
 *
 * Architecture:
 * - Core: Pure functional core with types, reducer, commands, and selectors
 * - Adapter: Side effects like HTTP requests (fetchPageTitle)
 * - UI: React components and hooks (imperative shell)
 *
 * Usage:
 * 1. Wrap your app with LinkCaptureProvider
 * 2. Mount LinkCaptureNotification component
 * 3. Call useLinkCaptureNotification hook to listen for IPC events
 * 4. Use fetchPageTitle from adapter for fetching link titles
 */

// Core types
export type {
  LinkCaptureNotification,
  LinkCaptureState,
  LinkCaptureAction,
} from "./core/types";

// Core reducer and state management
export { linkCaptureReducer, initialState } from "./core/reducer";

// Core commands (action creators)
export { capture, dismiss, dismissAll } from "./core/commands";

// Core selectors
export {
  getNotifications,
  getNotificationCount,
  getLatestNotification,
  getOldestNotification,
  hasNotifications,
  findNotificationById,
  getNotificationsSortedByTime,
} from "./core/selectors";

// UI components and hooks
export {
  LinkCaptureProvider,
  useLinkCaptureContext,
} from "./ui/LinkCaptureContext";
export { useLinkCaptureNotification } from "./ui/useLinkCaptureNotification";
export { LinkCaptureNotification as LinkCaptureNotificationComponent } from "./ui/LinkCaptureNotification";
export { LinkCaptureItem } from "./ui/LinkCaptureItem";

// Adapter utilities
export { fetchPageTitle } from "./adapter/fetchPageTitle";
export type { FetchPageTitleOptions } from "./adapter/fetchPageTitle";
