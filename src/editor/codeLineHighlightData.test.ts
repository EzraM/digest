import {
  parseHighlightedLines,
  readLineHighlights,
  selectedLineNumbers,
  serializeHighlightedLines,
  toggleLines,
  writeLineHighlights,
} from "./codeLineHighlightData";
import * as Y from "yjs";

describe("code line highlight data", () => {
  it("finds every line touched by a selection", () => {
    const source = "one\ntwo\nthree";
    expect(selectedLineNumbers(source, 1, 7)).toEqual([1, 2]);
    expect(selectedLineNumbers(source, 4, 4)).toEqual([2]);
    expect(selectedLineNumbers(source, 0, 4)).toEqual([1]);
  });

  it("toggles a selection as a group", () => {
    expect(toggleLines([1], [2, 3])).toEqual([1, 2, 3]);
    expect(toggleLines([1, 2, 3], [2, 3])).toEqual([1]);
  });

  it("stores normalized line arrays", () => {
    expect(parseHighlightedLines(serializeHighlightedLines([3, 1, 3]))).toEqual([
      1,
      3,
    ]);
    expect(parseHighlightedLines("not json")).toEqual([]);
  });

  it("round-trips highlights through a Yjs document update", () => {
    const source = new Y.Doc();
    writeLineHighlights(source.getMap<string>("codeLineHighlights"), "block-1", [
      4,
      2,
    ]);

    const replica = new Y.Doc();
    Y.applyUpdate(replica, Y.encodeStateAsUpdate(source));
    expect(
      readLineHighlights(
        replica.getMap<string>("codeLineHighlights"),
        "block-1"
      )
    ).toEqual([2, 4]);
  });
});
