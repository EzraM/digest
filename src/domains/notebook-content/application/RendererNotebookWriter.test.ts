import { createInlineLinkBlock } from "../../../hooks/inlineLinkInsertion";
import { CustomBlockNoteEditor } from "../../../types/schema";
import { afterNotebookBlock, notebookEnd } from "../core/NotebookAddress";
import { RendererNotebookWriter } from "./RendererNotebookWriter";

describe("RendererNotebookWriter", () => {
  it("captures a notebook address independently of the editor", () => {
    const cursorBlock = { id: "cursor-block" };
    const editor = {
      document: [cursorBlock],
      getBlock: () => cursorBlock,
      getTextCursorPosition: () => ({ block: cursorBlock }),
      insertBlocks: () => undefined,
    };
    const writer = new RendererNotebookWriter(
      editor as unknown as CustomBlockNoteEditor,
      "document-1"
    );

    expect(writer.captureAddress()).toEqual(
      afterNotebookBlock("document-1", cursorBlock.id)
    );
    expect(writer.captureAddress("source-block")).toEqual(
      afterNotebookBlock("document-1", "source-block")
    );
  });

  it("inserts a titled link after the site block that opened the page", () => {
    const sourceBlock = { id: "site-block" };
    const insertions: unknown[][] = [];
    const editor = {
      document: [sourceBlock],
      getBlock: (id: string) =>
        id === sourceBlock.id ? sourceBlock : undefined,
      getTextCursorPosition: () => undefined,
      insertBlocks: (...args: unknown[]) => insertions.push(args),
    };
    const writer = new RendererNotebookWriter(
      editor as unknown as CustomBlockNoteEditor,
      "document-1"
    );

    const inserted = writer.insert(
      afterNotebookBlock("document-1", sourceBlock.id),
      [
        createInlineLinkBlock({
          url: "https://example.test/article",
          title: "Example article",
        }),
      ]
    );

    expect(inserted).toBe(true);
    expect(insertions).toEqual([
      [
        [
          {
            type: "paragraph",
            content: [
              {
                type: "link",
                href: "https://example.test/article",
                content: [
                  {
                    type: "text",
                    text: "Example article",
                    styles: {},
                  },
                ],
              },
            ],
          },
        ],
        sourceBlock,
        "after",
      ],
    ]);
  });

  it("appends after the last notebook block when a URL route has no cursor", () => {
    const lastBlock = { id: "last-block" };
    const insertions: unknown[][] = [];
    const editor = {
      document: [{ id: "first-block" }, lastBlock],
      getBlock: () => undefined,
      getTextCursorPosition: () => undefined,
      insertBlocks: (...args: unknown[]) => insertions.push(args),
    };
    const writer = new RendererNotebookWriter(
      editor as unknown as CustomBlockNoteEditor,
      "document-1"
    );

    const inserted = writer.insert(
      notebookEnd("document-1"),
      [
        createInlineLinkBlock({
          url: "https://example.test/",
          title: "Example",
        }),
      ]
    );

    expect(inserted).toBe(true);
    expect(insertions[0][1]).toBe(lastBlock);
    expect(insertions[0][2]).toBe("after");
  });

  it("rejects an address in another notebook", () => {
    const editor = {
      document: [{ id: "last-block" }],
      getBlock: () => undefined,
      getTextCursorPosition: () => undefined,
      insertBlocks: () => undefined,
    };
    const writer = new RendererNotebookWriter(
      editor as unknown as CustomBlockNoteEditor,
      "document-1"
    );

    let message = "";
    try {
      writer.insert(notebookEnd("document-2"), [
        createInlineLinkBlock({
          url: "https://example.test/",
          title: "Example",
        }),
      ]);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain("document-2");
    expect(message).toContain("document-1");
  });
});
