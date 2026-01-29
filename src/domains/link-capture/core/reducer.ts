/**
 * Pure state reducer for link capture notifications
 * Implements functional core - no side effects, fully testable
 */

import { LinkCaptureState, LinkCaptureAction, LinkCaptureNotification } from './types';

/**
 * Initial state for link capture
 */
export const initialState: LinkCaptureState = {
  notifications: [],
};

/**
 * Generate a unique ID for a notification
 */
function generateNotificationId(): string {
  return `link-capture-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Pure reducer function for link capture state transitions
 */
export function linkCaptureReducer(
  state: LinkCaptureState,
  action: LinkCaptureAction
): LinkCaptureState {
  switch (action.type) {
    case 'CAPTURE': {
      const notification: LinkCaptureNotification = {
        id: generateNotificationId(),
        url: action.url,
        title: action.title,
        capturedAt: Date.now(),
      };

      return {
        ...state,
        notifications: [...state.notifications, notification],
      };
    }

    case 'DISMISS': {
      return {
        ...state,
        notifications: state.notifications.filter((n) => n.id !== action.id),
      };
    }

    case 'DISMISS_ALL': {
      return {
        ...state,
        notifications: [],
      };
    }

    default:
      return state;
  }
}
