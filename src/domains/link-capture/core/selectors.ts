/**
 * Selectors for querying link capture state
 * Pure functions for deriving data from state
 */

import { LinkCaptureState, LinkCaptureNotification } from './types';

/**
 * Get all notifications
 */
export function getNotifications(state: LinkCaptureState): LinkCaptureNotification[] {
  return state.notifications;
}

/**
 * Get the count of active notifications
 */
export function getNotificationCount(state: LinkCaptureState): number {
  return state.notifications.length;
}

/**
 * Get the most recent notification (last in the array)
 */
export function getLatestNotification(state: LinkCaptureState): LinkCaptureNotification | null {
  const notifications = state.notifications;
  return notifications.length > 0 ? notifications[notifications.length - 1] : null;
}

/**
 * Get the oldest notification (first in the array)
 */
export function getOldestNotification(state: LinkCaptureState): LinkCaptureNotification | null {
  const notifications = state.notifications;
  return notifications.length > 0 ? notifications[0] : null;
}

/**
 * Check if there are any notifications
 */
export function hasNotifications(state: LinkCaptureState): boolean {
  return state.notifications.length > 0;
}

/**
 * Find a notification by ID
 */
export function findNotificationById(
  state: LinkCaptureState,
  id: string
): LinkCaptureNotification | undefined {
  return state.notifications.find((n) => n.id === id);
}

/**
 * Get notifications sorted by capture time (newest first)
 */
export function getNotificationsSortedByTime(
  state: LinkCaptureState,
  order: 'asc' | 'desc' = 'desc'
): LinkCaptureNotification[] {
  const sorted = [...state.notifications].sort((a, b) => {
    return order === 'desc'
      ? b.capturedAt - a.capturedAt
      : a.capturedAt - b.capturedAt;
  });
  return sorted;
}
