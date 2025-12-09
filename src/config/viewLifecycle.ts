export const VIEW_LIFECYCLE = {
  GC_DELAY_MS: 5000, // Delay before running GC
  GC_MAX_AGE_MS: 30000, // Don't GC views accessed within this window
  GC_MAX_VIEWS: 20, // Force GC if more than N unreferenced views
};
