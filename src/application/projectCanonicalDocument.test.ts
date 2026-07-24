import {
  countProjectedBlocks,
  projectCanonicalDocument,
} from "./projectCanonicalDocument";

describe("projectCanonicalDocument", () => {
  it("projects block containers, inline content, props, and nested blocks", () => {
    const blocks = projectCanonicalDocument({
      type: "doc",
      content: [
        {
          type: "blockGroup",
          content: [
            {
              type: "blockContainer",
              attrs: { id: "parent" },
              content: [
                {
                  type: "paragraph",
                  attrs: { textAlignment: "left" },
                  content: [
                    { type: "text", text: "Hello", marks: [{ type: "bold" }] },
                    {
                      type: "text",
                      text: " link",
                      marks: [
                        { type: "link", attrs: { href: "https://example.com" } },
                      ],
                    },
                  ],
                },
                {
                  type: "blockGroup",
                  content: [
                    {
                      type: "blockContainer",
                      attrs: { id: "image" },
                      content: [
                        {
                          type: "image",
                          attrs: { url: "digest-image://image-1" },
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });

    expect(blocks).toMatchObject([
      {
        id: "parent",
        type: "paragraph",
        props: { textAlignment: "left" },
        content: [
          { type: "text", text: "Hello", styles: { bold: true } },
          {
            type: "link",
            href: "https://example.com",
            content: [{ type: "text", text: " link" }],
          },
        ],
        children: [
          {
            id: "image",
            type: "image",
            props: { url: "digest-image://image-1" },
          },
        ],
      },
    ]);
    expect(countProjectedBlocks(blocks)).toBe(2);
  });
});
