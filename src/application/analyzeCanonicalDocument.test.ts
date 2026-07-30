import { analyzeCanonicalDocument } from "./analyzeCanonicalDocument";

describe("analyzeCanonicalDocument", () => {
  it("extracts searchable blocks and image references", () => {
    const analysis = analyzeCanonicalDocument({
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

    expect(analysis.searchBlocks).toMatchObject([
      {
        id: "parent",
        type: "paragraph",
        props: { textAlignment: "left" },
        content: "Hello link",
        children: [
          {
            id: "image",
            type: "image",
            props: { url: "digest-image://image-1" },
          },
        ],
      },
    ]);
    expect(Array.from(analysis.assetIds)).toEqual(["image-1"]);
  });
});
