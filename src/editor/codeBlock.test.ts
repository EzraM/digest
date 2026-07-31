import { alabasterTheme } from "./alabasterTheme";

describe("Alabaster code theme", () => {
  it("keeps the palette restrained to meaningful syntax", () => {
    const namedRules = (alabasterTheme.settings ?? [])
      .map((rule) => "name" in rule && rule.name)
      .filter(Boolean);

    expect(namedRules).toEqual([
      "Comments",
      "Strings",
      "Constants",
      "Definitions",
      "Punctuation",
      "Invalid",
    ]);
    expect(namedRules).not.toContain("Keywords");
    expect(namedRules).not.toContain("Variables");
  });
});
