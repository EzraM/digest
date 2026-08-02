import { createDocumentHandlers } from "./documentHandlers";

describe("document handlers", () => {
  it("clears the document search index after deleting a page", async () => {
    const calls: string[] = [];
    const documentManager = {
      deleteDocument: async (documentId: string) => ({
        status: "deleted" as const,
        documentId,
        profileId: "profile-1",
        replacementDocumentId: null,
      }),
    };
    const handlers = createDocumentHandlers(
      documentManager as never,
      {} as never,
      () => null,
      () => undefined,
      () => undefined,
      async (documentId) => {
        calls.push(documentId);
      }
    );

    const handler = handlers["documents:delete"];
    if (handler.type !== "invoke") throw new Error("Expected invoke handler");
    await handler.fn({} as never, "document-1");

    expect(calls).toEqual(["document-1"]);
  });
});
