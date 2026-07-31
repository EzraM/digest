import { createExtension, type ExtensionOptions } from "@blocknote/core";
import type { EditorState } from "@tiptap/pm/state";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import * as Y from "yjs";
import {
  parseHighlightedLines,
  readLineHighlights,
  selectedLineNumbers,
  toggleLines,
  writeLineHighlights,
} from "./codeLineHighlightData";

const pluginKey = new PluginKey<DecorationSet>("codeLineHighlights");
const refreshMeta = "codeLineHighlights:refresh";
const mapName = "codeLineHighlights";

type CodeSelection = {
  blockId: string;
  lines: number[];
};

const selectionCodeLines = (state: EditorState): CodeSelection | null => {
  const { $from, $to } = state.selection;
  if (
    $from.parent.type.name !== "codeBlock" ||
    $to.parent.type.name !== "codeBlock" ||
    $from.parent !== $to.parent
  ) {
    return null;
  }

  let blockId: string | undefined;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type.name === "blockContainer" && typeof node.attrs.id === "string") {
      blockId = node.attrs.id;
      break;
    }
  }
  if (!blockId) return null;

  return {
    blockId,
    lines: selectedLineNumbers(
      $from.parent.textContent,
      $from.parentOffset,
      $to.parentOffset
    ),
  };
};

const buildDecorations = (
  state: EditorState,
  highlights: Y.Map<string>
): DecorationSet => {
  const decorations: Decoration[] = [];

  state.doc.descendants((node, position) => {
    if (node.type.name !== "blockContainer") return true;
    const blockId = node.attrs.id;
    const codeBlock = node.firstChild;
    if (
      typeof blockId !== "string" ||
      codeBlock?.type.name !== "codeBlock"
    ) {
      return false;
    }

    const selected = new Set(parseHighlightedLines(highlights.get(blockId)));
    if (selected.size === 0) return false;

    const contentStart = position + 2;
    let line = 1;
    let lineStart = 0;
    const text = codeBlock.textContent;
    for (let offset = 0; offset <= text.length; offset += 1) {
      if (offset !== text.length && text[offset] !== "\n") continue;
      if (selected.has(line)) {
        const from = contentStart + lineStart;
        const to = contentStart + offset;
        if (to > from) {
          decorations.push(
            Decoration.inline(from, to, {
              class: "digest-code-highlighted-line",
            })
          );
        } else {
          decorations.push(
            Decoration.widget(from, () => {
              const marker = document.createElement("span");
              marker.className = "digest-code-highlighted-empty-line";
              marker.setAttribute("aria-hidden", "true");
              return marker;
            })
          );
        }
      }
      line += 1;
      lineStart = offset + 1;
    }
    return false;
  });

  return DecorationSet.create(state.doc, decorations);
};

const codeBlockIds = (state: EditorState): Set<string> => {
  const ids = new Set<string>();
  state.doc.descendants((node) => {
    if (node.type.name !== "blockContainer") return true;
    if (
      node.firstChild?.type.name === "codeBlock" &&
      typeof node.attrs.id === "string"
    ) {
      ids.add(node.attrs.id);
    }
    return false;
  });
  return ids;
};

export const createCodeLineHighlightExtension = createExtension(
  ({ editor, options }: ExtensionOptions<{ yDoc: Y.Doc }>) => {
    const highlights = options.yDoc.getMap<string>(mapName);

    const toggleSelectedLines = (): boolean => {
      const selection = selectionCodeLines(editor.prosemirrorState);
      if (!selection) return false;

      const next = toggleLines(
        readLineHighlights(highlights, selection.blockId),
        selection.lines
      );
      writeLineHighlights(highlights, selection.blockId, next);
      return true;
    };

    return {
      key: "codeLineHighlights" as const,
      toggleSelectedLines,
      keyboardShortcuts: {
        "Mod-Shift-h": () => toggleSelectedLines(),
      },
      prosemirrorPlugins: [
        new Plugin<DecorationSet>({
          key: pluginKey,
          state: {
            init: (_config, state) => buildDecorations(state, highlights),
            apply: (transaction, decorations, _oldState, newState) =>
              transaction.docChanged || transaction.getMeta(refreshMeta)
                ? buildDecorations(newState, highlights)
                : decorations.map(transaction.mapping, transaction.doc),
          },
          props: {
            decorations: (state) => pluginKey.getState(state) ?? null,
          },
          view: (view) => {
            let destroyed = false;
            let cleanupQueued = false;
            const refresh = () => {
              if (!destroyed) {
                view.dispatch(view.state.tr.setMeta(refreshMeta, true));
              }
            };
            const queueOrphanCleanup = () => {
              if (destroyed || cleanupQueued) return;
              cleanupQueued = true;
              queueMicrotask(() => {
                cleanupQueued = false;
                if (destroyed) return;
                const liveIds = codeBlockIds(view.state);
                options.yDoc.transact(() => {
                  Array.from(highlights.keys()).forEach((blockId) => {
                    if (!liveIds.has(blockId)) highlights.delete(blockId);
                  });
                });
              });
            };
            highlights.observe(refresh);
            queueMicrotask(refresh);
            queueOrphanCleanup();
            return {
              update: (_view, previousState) => {
                if (previousState.doc !== view.state.doc) queueOrphanCleanup();
              },
              destroy: () => {
                destroyed = true;
                highlights.unobserve(refresh);
              },
            };
          },
        }),
      ],
    };
  }
);
