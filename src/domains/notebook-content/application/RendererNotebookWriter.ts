import type { BlockOperation } from "../../blocks/core";
import type {
  CustomBlockNoteEditor,
  CustomPartialBlock,
} from "../../../types/schema";
import {
  afterNotebookBlock,
  NotebookAddress,
  notebookEnd,
} from "../core/NotebookAddress";

export class RendererNotebookWriter {
  constructor(
    private readonly editor: CustomBlockNoteEditor,
    private readonly documentId: string
  ) {}

  captureAddress(preferredBlockId?: string): NotebookAddress {
    if (preferredBlockId) {
      return afterNotebookBlock(this.documentId, preferredBlockId);
    }

    try {
      const cursorBlock = this.editor.getTextCursorPosition()?.block;
      if (cursorBlock) {
        return afterNotebookBlock(this.documentId, cursorBlock.id);
      }
    } catch {
      // The editor is commonly hidden while a full-page site is visible.
    }

    return notebookEnd(this.documentId);
  }

  insert(
    address: NotebookAddress,
    blocks: readonly CustomPartialBlock[]
  ): boolean {
    this.assertDocument(address);
    if (blocks.length === 0) return true;

    const anchor = this.resolveAnchor(address);
    if (!anchor) {
      console.warn("[RendererNotebookWriter] Address has no insertion anchor", {
        address,
      });
      return false;
    }

    this.editor.insertBlocks([...blocks], anchor, "after");
    return true;
  }

  applyOperations(
    address: NotebookAddress,
    operations: readonly BlockOperation[]
  ): boolean {
    this.assertDocument(address);
    let anchor = this.resolveAnchor(address);
    if (!anchor) return false;

    for (const operation of operations) {
      if (operation.type !== "insert" || !operation.block) {
        throw new Error(
          `Notebook writer operation is not supported: ${operation.type}`
        );
      }

      this.editor.insertBlocks(
        [operation.block as unknown as CustomPartialBlock],
        anchor,
        "after"
      );
      anchor = this.editor.getBlock(operation.blockId) ?? anchor;
    }

    return true;
  }

  private resolveAnchor(address: NotebookAddress) {
    if (address.position.kind === "after-block") {
      const addressedBlock = this.editor.getBlock(address.position.blockId);
      if (addressedBlock) return addressedBlock;
    }

    return this.editor.document.at(-1);
  }

  private assertDocument(address: NotebookAddress): void {
    if (address.documentId !== this.documentId) {
      throw new Error(
        `Notebook address targets ${address.documentId}, but writer owns ${this.documentId}`
      );
    }
  }
}
