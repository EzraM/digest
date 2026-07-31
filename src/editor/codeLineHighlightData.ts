export const parseHighlightedLines = (value: string | undefined): number[] => {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return Array.from(
      new Set(
        parsed.filter(
          (line): line is number => Number.isInteger(line) && line > 0
        )
      )
    ).sort((a, b) => a - b);
  } catch {
    return [];
  }
};

export const serializeHighlightedLines = (lines: Iterable<number>): string =>
  JSON.stringify(
    Array.from(new Set(lines))
      .filter((line) => Number.isInteger(line) && line > 0)
      .sort((a, b) => a - b)
  );

export const selectedLineNumbers = (
  text: string,
  fromOffset: number,
  toOffset: number
): number[] => {
  const from = Math.max(0, Math.min(fromOffset, text.length));
  const to = Math.max(from, Math.min(toOffset, text.length));
  const startLine = text.slice(0, from).split("\n").length;
  // A selection ending exactly at the start of a line does not include it.
  const inclusiveEnd = to > from ? to - 1 : to;
  const endLine = text.slice(0, inclusiveEnd).split("\n").length;

  return Array.from(
    { length: endLine - startLine + 1 },
    (_, index) => startLine + index
  );
};

export const toggleLines = (
  highlighted: Iterable<number>,
  selected: Iterable<number>
): number[] => {
  const current = new Set(highlighted);
  const target = Array.from(new Set(selected));
  const remove = target.length > 0 && target.every((line) => current.has(line));
  target.forEach((line) => (remove ? current.delete(line) : current.add(line)));
  return Array.from(current).sort((a, b) => a - b);
};

type StringMap = {
  get(key: string): string | undefined;
  set(key: string, value: string): unknown;
  delete(key: string): unknown;
};

export const readLineHighlights = (
  highlights: StringMap,
  blockId: string
): number[] => parseHighlightedLines(highlights.get(blockId));

export const writeLineHighlights = (
  highlights: StringMap,
  blockId: string,
  lines: Iterable<number>
): void => {
  const serialized = serializeHighlightedLines(lines);
  if (serialized === "[]") highlights.delete(blockId);
  else highlights.set(blockId, serialized);
};
