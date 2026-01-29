/**
 * Command creators for link capture actions
 * Pure functions that create action objects
 */

import { LinkCaptureAction } from './types';

/**
 * Create an action to capture a new link
 */
export function capture(url: string, title: string): LinkCaptureAction {
  return { type: 'CAPTURE', url, title };
}

/**
 * Create an action to dismiss a specific notification
 */
export function dismiss(id: string): LinkCaptureAction {
  return { type: 'DISMISS', id };
}

/**
 * Create an action to dismiss all notifications
 */
export function dismissAll(): LinkCaptureAction {
  return { type: 'DISMISS_ALL' };
}
