import {
  DeleteLinkButton,
  EditLinkButton,
  LinkToolbar,
  LinkToolbarProps,
  useBlockNoteEditor,
  useComponentsContext,
} from "@blocknote/react";
import { useDocumentContext } from "../../context/DocumentContext";
import { boundedFallbackLinkLabel } from "../../domains/page-context/NotebookPageSource";
import { getBlockInfoAtNearest } from "@blocknote/core";

export const NotebookLinkToolbar = (props: LinkToolbarProps) => (
  <LinkToolbar {...props}>
    <EditLinkButton
      url={props.url}
      text={props.text}
      range={props.range}
      setToolbarOpen={props.setToolbarOpen}
      setToolbarPositionFrozen={props.setToolbarPositionFrozen}
    />
    <OpenLinkInNewDigestWindowButton url={props.url} label={props.text} range={props.range} />
    <DeleteLinkButton
      range={props.range}
      setToolbarOpen={props.setToolbarOpen}
    />
  </LinkToolbar>
);

const OpenLinkInNewDigestWindowButton = ({
  url,
  label,
  range,
}: {
  url: string;
  label: string;
  range: { from: number };
}) => {
  const components = useComponentsContext();
  const { documentId } = useDocumentContext();
  const editor = useBlockNoteEditor();

  if (!components) return null;

  return (
    <components.LinkToolbar.Button
      className="bn-button"
      mainTooltip="Open in new Digest window"
      label="Open in new Digest window"
      isSelected={false}
      onClick={() => {
        const blockId = editor.transact((transaction) =>
          String(getBlockInfoAtNearest(transaction, range.from).bnBlock.node.attrs.id)
        );
        void window.electronAPI.windows.openRoute({
          kind: "url",
          url,
          documentId: documentId ?? undefined,
          sourceBlockId: blockId,
          fallbackLinkLabel: boundedFallbackLinkLabel(label),
        });
      }}
      icon={<OpenInNewWindowIcon />}
    />
  );
};

const OpenInNewWindowIcon = () => (
  <svg
    aria-hidden="true"
    fill="none"
    height="18"
    viewBox="0 0 24 24"
    width="18"
  >
    <path
      d="M14 5h5v5M19 5l-8 8"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
    />
    <path
      d="M19 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
    />
  </svg>
);
