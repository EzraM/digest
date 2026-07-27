import { BlockNoteEditor } from "@blocknote/core";
// TypeScript's legacy "node" resolution does not follow this package export,
// while Vite and Electron resolve it correctly at runtime.
// @ts-expect-error BlockNote publishes types through the package export map.
// eslint-disable-next-line import/no-unresolved
import { _blocksToProsemirrorNode, blocksToYXmlFragment } from "@blocknote/core/yjs";
import { EditorState } from "@tiptap/pm/state";
import { initProseMirrorDoc, updateYFragment } from "y-prosemirror";
import * as Y from "yjs";
import { schema } from "../../../types/schema";
import type {
  NotebookBlockInput,
  NotebookPosition,
} from "../core/NotebookAddress";

export type HeadlessInsertion = {
  insertedBlockIds: string[];
  resolvedPosition: NotebookPosition;
  reanchored: boolean;
};

const editor = BlockNoteEditor.create({ schema });

export const insertBlocksHeadlessly = (
  doc: Y.Doc,
  requestedPosition: NotebookPosition,
  inputs: readonly NotebookBlockInput[],
  createId: () => string
): HeadlessInsertion => {
  if (inputs.length === 0) {
    throw new Error("At least one block is required");
  }

  const blocks = inputs.map((input) => ({
    ...input,
    id:
      typeof input.id === "string" && input.id.trim()
        ? input.id
        : createId(),
  }));
  const insertedBlockIds = blocks.map((block) => block.id);

  // This conversion is BlockNote's schema-validation boundary. It rejects
  // unknown block types, invalid props, and malformed inline content.
  const insertionDoc = _blocksToProsemirrorNode(editor, blocks as any);
  const insertion = insertionDoc.firstChild?.content;
  if (!insertion || insertion.size === 0) {
    throw new Error("No valid blocks were produced");
  }

  const fragment = doc.getXmlFragment("document");
  if (fragment.length === 0) {
    blocksToYXmlFragment(editor, blocks as any, fragment);
    return {
      insertedBlockIds,
      resolvedPosition: { kind: "end" },
      reanchored: requestedPosition.kind === "after-block",
    };
  }
  const initialized = initProseMirrorDoc(fragment, editor.pmSchema);
  let state = EditorState.create({
    schema: editor.pmSchema,
    doc: initialized.doc,
  });
  const group = state.doc.firstChild;
  if (!group || group.type.name !== "blockGroup") {
    throw new Error("Canonical document has no BlockNote block group");
  }

  let insertionPosition = state.doc.content.size - 1;
  let resolvedPosition: NotebookPosition = { kind: "end" };
  let reanchored = false;

  if (requestedPosition.kind === "after-block") {
    let offset = 1;
    let found = false;
    group.forEach((node) => {
      offset += node.nodeSize;
      if (!found && node.attrs.id === requestedPosition.blockId) {
        insertionPosition = offset;
        found = true;
      }
    });
    if (found) {
      resolvedPosition = requestedPosition;
    } else {
      reanchored = true;
    }
  }

  state = state.apply(state.tr.insert(insertionPosition, insertion));
  updateYFragment(doc, fragment, state.doc, initialized.meta);

  return {
    insertedBlockIds,
    resolvedPosition,
    reanchored,
  };
};
