import { createExtension } from "@blocknote/core";
import { EditorState, Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

type FocusedBlockState = {
  editorHasFocus: boolean;
};

const pluginKey = new PluginKey<FocusedBlockState>("focusedBlock");
const focusMeta = "editorHasFocus";

const focusedBlockDecoration = (state: EditorState): DecorationSet => {
  const pluginState = pluginKey.getState(state);
  if (!pluginState?.editorHasFocus) {
    return DecorationSet.empty;
  }

  const { $from } = state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type.name !== "blockContainer") continue;

    const from = $from.before(depth);
    return DecorationSet.create(state.doc, [
      Decoration.node(from, from + node.nodeSize, {
        class: "digest-focused-block",
      }),
    ]);
  }

  return DecorationSet.empty;
};

export const createFocusedBlockExtension = createExtension({
  key: "focusedBlock",
  prosemirrorPlugins: [
    new Plugin<FocusedBlockState>({
      key: pluginKey,
      state: {
        init: () => ({ editorHasFocus: false }),
        apply: (transaction, value) => {
          const nextFocus = transaction.getMeta(focusMeta);
          return typeof nextFocus === "boolean"
            ? { editorHasFocus: nextFocus }
            : value;
        },
      },
      props: {
        decorations: focusedBlockDecoration,
        handleDOMEvents: {
          focus: (view) => {
            view.dispatch(view.state.tr.setMeta(focusMeta, true));
            return false;
          },
          blur: (view) => {
            view.dispatch(view.state.tr.setMeta(focusMeta, false));
            return false;
          },
        },
      },
    }),
  ],
});
