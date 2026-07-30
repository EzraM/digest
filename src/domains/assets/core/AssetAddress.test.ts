import { assetAddress } from "./AssetAddress";

describe("assetAddress", () => {
  it("creates and parses local asset addresses", () => {
    expect(assetAddress.create("asset-1")).toBe("digest-image://asset-1");
    expect(assetAddress.parse("digest-image://asset-1")).toBe("asset-1");
  });

  it("rejects unrelated and malformed addresses", () => {
    expect(assetAddress.parse("https://example.com/image.png")).toBe(null);
    expect(assetAddress.parse("not a url")).toBe(null);
  });
});
