import { hasPreviousDigestRoute } from "./notebookReturnNavigation";

describe("hasPreviousDigestRoute", () => {
  it("returns false for a window opened directly on a page route", () => {
    expect(hasPreviousDigestRoute({ __TSR_index: 0 })).toBe(false);
  });

  it("returns true after navigating from a notebook to a page route", () => {
    expect(hasPreviousDigestRoute({ __TSR_index: 1 })).toBe(true);
  });

  it("does not treat missing or unrelated browser history as a Digest route", () => {
    expect(hasPreviousDigestRoute(null)).toBe(false);
    expect(hasPreviousDigestRoute({})).toBe(false);
  });
});

