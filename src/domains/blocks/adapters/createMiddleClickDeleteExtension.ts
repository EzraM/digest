import {
  BlockSchema,
  BlockNoteEditor,
  InlineContentSchema,
  StyleSchema,
  createBlockNoteExtension,
} from "@blocknote/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";

const BLOCK_SELECTOR = '[data-node-type="blockOuter"][data-id]';

export const createMiddleClickDeleteExtension = <
  BSchema extends BlockSchema,
  ISchema extends InlineContentSchema,
  SSchema extends StyleSchema
>(
  editor: BlockNoteEditor<BSchema, ISchema, SSchema>
) =>
  createBlockNoteExtension({
    key: "middleClickDelete",
    plugins: [
      new Plugin({
        key: new PluginKey("middleClickDelete"),
        props: {
          handleDOMEvents: {
            mousedown: (_view, event) => {
              if (event.button !== 1 || !editor.isEditable) return false;

              const target = event.target;
              if (!(target instanceof Element)) return false;

              const blockId = target
                .closest<HTMLElement>(BLOCK_SELECTOR)
                ?.getAttribute("data-id");
              if (!blockId || !editor.getBlock(blockId)) return false;

              event.preventDefault();
              event.stopPropagation();
              editor.removeBlocks([blockId]);
              return true;
            },
          },
        },
      }),
    ],
  });
