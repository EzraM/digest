import { windowRouteHash } from "./windowHandlers";

describe("windowRouteHash", () => {
  it("builds a document route", () => {
    expect(
      windowRouteHash({ kind: "doc", documentId: "notes/one" })
    ).toBe("#/doc/notes%2Fone");
  });

  it("builds a URL route with return context", () => {
    expect(
      windowRouteHash({
        kind: "url",
        url: "https://example.com/a path",
        documentId: "doc-1",
        sourceBlockId: "block-1",
        fallbackLinkLabel: "Example",
      })
    ).toBe(
      "#/url/https%3A%2F%2Fexample.com%2Fa%20path?doc=doc-1&source=block-1&label=Example"
    );
  });

  it("limits the fallback label stored in the route", () => {
    const hash = windowRouteHash({
      kind: "url",
      url: "https://example.com",
      fallbackLinkLabel: "x".repeat(300),
    });

    expect(
      new URLSearchParams(hash.split("?")[1]).get("label")?.length
    ).toBe(240);
  });

  it("rejects invalid routes", () => {
    const invalidRoutes = [
      null,
      {},
      { kind: "doc" },
      { kind: "url" },
      { kind: "other", url: "https://example.com" },
    ];

    for (const route of invalidRoutes) {
      let message = "";
      try {
        windowRouteHash(route);
      } catch (error) {
        message = error instanceof Error ? error.message : String(error);
      }
      expect(message).toBe("Invalid Digest window route");
    }
  });
});
