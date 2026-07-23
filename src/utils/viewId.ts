const FULL_SUFFIX = ':full';

/** Extract the blockId from any viewId (strips :full suffix if present) */
export const toBlockId = (viewId: string): string =>
  viewId.endsWith(FULL_SUFFIX)
    ? viewId.slice(0, -FULL_SUFFIX.length)
    : viewId;
