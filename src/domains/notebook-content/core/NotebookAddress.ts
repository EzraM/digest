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
