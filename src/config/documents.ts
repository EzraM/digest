export const MAX_DOCUMENT_DEPTH = 4;

export const getMaxAllowedChildDepth = (): number => {
  return MAX_DOCUMENT_DEPTH - 1;
};
