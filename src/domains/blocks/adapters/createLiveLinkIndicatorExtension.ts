import { createBlockNoteExtension } from "@blocknote/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import {
  isLiveIndicatorUrl,
  subscribeToLivePageState,
} from "../../../Browser/livePageStore";

const pluginKey = new PluginKey<DecorationSet>("liveLinkIndicator");
const LIVE_DESCRIPTION = "Page is kept live";

const buildDecorations = (
  doc: Parameters<typeof DecorationSet.create>[0]
): DecorationSet => {
  const decorations: Decoration[] = [];

  doc.descendants((node, position) => {
    if (!node.isText) return;

    const link = node.marks.find((mark) => mark.type.name === "link");
    const href = link?.attrs.href;
    if (typeof href !== "string" || !isLiveIndicatorUrl(href)) return;

    decorations.push(
      Decoration.inline(position, position + node.nodeSize, {
        class: "digest-live-page",
        "aria-description": LIVE_DESCRIPTION,
        title: LIVE_DESCRIPTION,
      })
    );
  });

  return DecorationSet.create(doc, decorations);
};

export const createLiveLinkIndicatorExtension = () =>
  createBlockNoteExtension({
    key: "liveLinkIndicator",
    plugins: [
      new Plugin<DecorationSet>({
        key: pluginKey,
        state: {
          init: (_config, state) => buildDecorations(state.doc),
          apply: (transaction, decorations) => {
            if (
              transaction.docChanged ||
              transaction.getMeta(pluginKey) === true
            ) {
              return buildDecorations(transaction.doc);
            }
            return decorations;
          },
        },
        props: {
          decorations: (state) => pluginKey.getState(state) ?? null,
        },
        view: (view) => {
          let destroyed = false;
          const refresh = () => {
            if (destroyed) return;
            view.dispatch(view.state.tr.setMeta(pluginKey, true));
          };
          const unsubscribe = subscribeToLivePageState(refresh);

          // The editor survives route changes while its BlockNote view does not.
          // Recompute once when the view remounts to include live-page changes
          // that occurred while no plugin view was subscribed.
          queueMicrotask(refresh);

          return {
            destroy: () => {
              destroyed = true;
              unsubscribe();
            },
          };
        },
      }),
    ],
  });
