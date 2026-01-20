/**
 * ViewIds are layout-qualified identifiers:
 * - Inline layout: just the blockId (e.g., "abc123")
 * - Full layout: blockId with suffix (e.g., "abc123:full")
 */

const FULL_SUFFIX = ':full';

/** Convert a blockId to a full-layout viewId */
export const toFullViewId = (blockId: string): string =>
  `${blockId}${FULL_SUFFIX}`;

/** Extract the blockId from any viewId (strips :full suffix if present) */
export const toBlockId = (viewId: string): string =>
  viewId.endsWith(FULL_SUFFIX)
    ? viewId.slice(0, -FULL_SUFFIX.length)
    : viewId;

/** Check if a viewId represents a full-layout view */
export const isFullViewId = (viewId: string): boolean =>
  viewId.endsWith(FULL_SUFFIX);
