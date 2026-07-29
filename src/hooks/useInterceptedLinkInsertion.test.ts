import { isBlockRouteHash } from "./useInterceptedLinkInsertion";

describe("isBlockRouteHash", () => {
  it("matches the addressed block route", () => {
    expect(isBlockRouteHash("#/block/block-1?doc=document-1", "block-1")).toBe(
      true
    );
  });

  it("decodes block IDs and rejects other routes", () => {
    expect(isBlockRouteHash("#/block/block%2F1", "block/1")).toBe(true);
    expect(isBlockRouteHash("#/block/block-2", "block-1")).toBe(false);
    expect(isBlockRouteHash("#/url/https%3A%2F%2Fexample.test", "block-1")).toBe(
      false
    );
  });
});
