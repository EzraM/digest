export type NotebookPosition =
  | { kind: "after-block"; blockId: string }
  | { kind: "end" };

export type NotebookAddress = {
  documentId: string;
  position: NotebookPosition;
};

export const afterNotebookBlock = (
  documentId: string,
  blockId: string
): NotebookAddress => ({
  documentId,
  position: { kind: "after-block", blockId },
});

export const notebookEnd = (documentId: string): NotebookAddress => ({
  documentId,
  position: { kind: "end" },
});

export type NotebookWriteOrigin = {
  source: "page-link" | "clip" | "image" | "download" | "agent";
  sourceUrl?: string;
  capturedAt: number;
};

export type NotebookBlockInput = Record<string, unknown>;

export type InsertNotebookContent = {
  address: NotebookAddress;
  blocks: readonly NotebookBlockInput[];
  requestId: string;
  origin: NotebookWriteOrigin;
};

export type NotebookWriteResult =
  | {
      status: "inserted";
      documentId: string;
      insertedBlockIds: string[];
      resolvedPosition: NotebookPosition;
      updateId: string;
    }
  | {
      status: "reanchored";
      documentId: string;
      insertedBlockIds: string[];
      requestedPosition: NotebookPosition;
      resolvedPosition: NotebookPosition;
      updateId: string;
    }
  | {
      status: "rejected";
      reason:
        | "document-not-found"
        | "invalid-content"
        | "address-not-found"
        | "duplicate-request";
    };
