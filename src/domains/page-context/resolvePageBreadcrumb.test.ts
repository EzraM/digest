import { resolvePageBreadcrumb } from "./resolvePageBreadcrumb";

const source = {
  documentId: "doc-1",
  blockId: "source",
  fallbackLinkLabel: "Fallback",
};

describe("resolvePageBreadcrumb", () => {
  it("resolves the containing heading path and current link label", () => {
    const result = resolvePageBreadcrumb("Work", [
      { id: "h1", type: "heading", props: { level: 1 }, content: [{ type: "text", text: "Reporting" }] },
      { id: "p", type: "paragraph", content: "intervening" },
      { id: "h2", type: "heading", props: { level: 2 }, content: [{ type: "text", text: "Database" }] },
      { id: "source", type: "paragraph", content: [{ type: "link", href: "https://example.com", content: [{ type: "text", text: "PD-3707 PR" }] }] },
    ], source, "https://example.com");

    expect(result).toMatchObject({
      notebookTitle: "Work",
      headingPath: [
        { blockId: "h1", level: 1, text: "Reporting" },
        { blockId: "h2", level: 2, text: "Database" },
      ],
      linkLabel: "PD-3707 PR",
      sourceExists: true,
    });
  });

  it("traverses nested blocks and ignores empty headings", () => {
    const result = resolvePageBreadcrumb("Work", [{
      id: "parent",
      type: "paragraph",
      children: [
        { id: "empty", type: "heading", props: { level: 1 }, content: [] },
        { id: "heading", type: "heading", props: { level: 2 }, content: "Nested" },
        { id: "source", type: "paragraph", content: [] },
      ],
    }], source, "https://example.com");

    expect(result.headingPath).toEqual([
      { blockId: "heading", level: 2, text: "Nested" },
    ]);
  });

  it("uses fallback presentation data when the source is missing", () => {
    const result = resolvePageBreadcrumb(null, [], source, "https://example.com");
    expect(result).toMatchObject({
      notebookTitle: "Untitled",
      headingPath: [],
      linkLabel: "Fallback",
      sourceExists: false,
    });
  });

  it("keeps a site block's captured label stable during live navigation", () => {
    const result = resolvePageBreadcrumb("Work", [{
      id: "source",
      type: "site",
      props: { url: "https://later.example" },
    }], {
      ...source,
      fallbackLinkLabel: "https://origin.example",
    }, "https://origin.example");

    expect(result.linkLabel).toBe("https://origin.example");
  });
});
