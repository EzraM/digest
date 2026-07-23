import {
  DeleteLinkButton,
  EditLinkButton,
  LinkToolbar,
  LinkToolbarProps,
  useComponentsContext,
} from "@blocknote/react";
import { useDocumentContext } from "../../context/DocumentContext";

export const NotebookLinkToolbar = (props: LinkToolbarProps) => (
  <LinkToolbar {...props}>
    <EditLinkButton
      url={props.url}
      text={props.text}
      range={props.range}
      setToolbarOpen={props.setToolbarOpen}
      setToolbarPositionFrozen={props.setToolbarPositionFrozen}
    />
    <OpenLinkInNewDigestWindowButton url={props.url} />
    <DeleteLinkButton
      range={props.range}
      setToolbarOpen={props.setToolbarOpen}
    />
  </LinkToolbar>
);

const OpenLinkInNewDigestWindowButton = ({ url }: { url: string }) => {
  const components = useComponentsContext();
  const { documentId } = useDocumentContext();

  if (!components) return null;

  return (
    <components.LinkToolbar.Button
      className="bn-button"
      mainTooltip="Open in new Digest window"
      label="Open in new Digest window"
      isSelected={false}
      onClick={() => {
        void window.electronAPI.windows.openRoute({
          kind: "url",
          url,
          documentId: documentId ?? undefined,
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
