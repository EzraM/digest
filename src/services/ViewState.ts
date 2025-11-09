/**
 * ViewState - State machine for browser view lifecycle
 *
 * States:
 * - UNINITIALIZED: No view created yet
 * - CREATING: View is being created
 * - LOADING: View created, URL is loading
 * - LOADED: View successfully loaded
 * - ERROR: View failed to load (error state)
 * - REMOVED: View has been removed/cleaned up (e.g., scrolled out of view)
 */

export enum ViewState {
  UNINITIALIZED = "uninitialized",
  CREATING = "creating",
  LOADING = "loading",
  LOADED = "loaded",
  ERROR = "error",
  REMOVED = "removed",
}

/**
 * Valid state transitions
 */
const VALID_TRANSITIONS: Record<ViewState, ViewState[]> = {
  [ViewState.UNINITIALIZED]: [ViewState.CREATING, ViewState.REMOVED],
  [ViewState.CREATING]: [ViewState.LOADING, ViewState.ERROR, ViewState.REMOVED],
  [ViewState.LOADING]: [ViewState.LOADED, ViewState.ERROR, ViewState.REMOVED],
  [ViewState.LOADED]: [
    ViewState.LOADING, // Reload
    ViewState.ERROR,
    ViewState.REMOVED,
  ],
  [ViewState.ERROR]: [
    ViewState.LOADING, // Retry
    ViewState.REMOVED,
  ],
  [ViewState.REMOVED]: [ViewState.UNINITIALIZED, ViewState.CREATING],
};

/**
 * Check if a state transition is valid
 */
export function isValidTransition(from: ViewState, to: ViewState): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Get the default state
 */
export function getDefaultState(): ViewState {
  return ViewState.UNINITIALIZED;
}

/**
 * Check if a state allows bounds updates without changing state
 */
export function allowsBoundsUpdate(state: ViewState): boolean {
  // Bounds updates should not change state in these states
  return [ViewState.LOADING, ViewState.LOADED, ViewState.ERROR].includes(state);
}

/**
 * Check if a state allows error recovery (retry)
 */
export function allowsRetry(state: ViewState): boolean {
  return state === ViewState.ERROR;
}
