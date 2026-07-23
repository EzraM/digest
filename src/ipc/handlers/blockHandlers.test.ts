import { createBlockHandlers } from "./blockHandlers";

describe("block operation IPC", () => {
  it("uses the named document and stamps trusted renderer provenance", async () => {
    const calls: any[] = [];
    const documentManager = {
      getDocument: (documentId: string) => ({ id: documentId }),
      getBlockService: () => ({
        setRendererWebContents: () => undefined,
      }),
    } as any;
    const applier = {
      apply: async (...args: any[]) => {
        calls.push(args);
        return { success: true, operationsApplied: 1 };
      },
    } as any;
    const handler = createBlockHandlers(
      documentManager,
      null,
      applier,
      (rendererId) => (rendererId === 42 ? "window-a" : undefined)
    )["block-operations:apply"];
    if (handler.type !== "invoke") throw new Error("expected invoke handler");

    await handler.fn(
      { sender: { id: 42 } } as any,
      {
        documentId: "doc-b",
        operations: [{ id: "operation" }],
        origin: {
          source: "user",
          rendererId: 999,
          windowId: "forged",
        },
      }
    );

    expect(calls[0][0]).toBe("doc-b");
    expect(calls[0][2]).toMatchObject({
      source: "user",
      rendererId: 42,
      windowId: "window-a",
    });
  });
});
