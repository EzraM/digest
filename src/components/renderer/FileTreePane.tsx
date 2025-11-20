import { DocumentRecord, DocumentTreeNode, ProfileRecord } from "../../types/documents";
import { FileTree } from "../FileTree/FileTree";

type FileTreePaneProps = {
  profiles: ProfileRecord[];
  activeProfileId: string | null;
  onSelectProfile: (profileId: string) => void;
  onCreateProfile: () => void;
  documentTree: DocumentTreeNode[];
  activeDocumentId: string | null;
  onSelectDocument: (documentId: string) => void;
  onCreateDocument: (params: {
    profileId: string;
    parentDocumentId?: string | null;
  }) => Promise<DocumentRecord | null>;
  onRenameDocument: (
    documentId: string,
    title: string
  ) => Promise<DocumentRecord | null>;
  onDeleteDocument: (documentId: string) => Promise<boolean>;
  onMoveDocumentToProfile: (
    documentId: string,
    newProfileId: string
  ) => Promise<boolean>;
  onMoveDocument: (params: {
    documentId: string;
    newParentId: string | null;
    position: number;
  }) => Promise<boolean>;
  pendingEditDocumentId: string | null;
  onPendingEditConsumed: () => void;
  onPendingDocumentNamed: (document: DocumentRecord) => void;
};

export const FileTreePane = (props: FileTreePaneProps) => (
  <FileTree
    profiles={props.profiles}
    activeProfileId={props.activeProfileId}
    onSelectProfile={props.onSelectProfile}
    onCreateProfile={props.onCreateProfile}
    documentTree={props.documentTree}
    activeDocumentId={props.activeDocumentId}
    onSelectDocument={props.onSelectDocument}
    onCreateDocument={props.onCreateDocument}
    onRenameDocument={props.onRenameDocument}
    onDeleteDocument={props.onDeleteDocument}
    onMoveDocumentToProfile={props.onMoveDocumentToProfile}
    onMoveDocument={props.onMoveDocument}
    pendingEditDocumentId={props.pendingEditDocumentId}
    onPendingEditConsumed={props.onPendingEditConsumed}
    onPendingDocumentNamed={props.onPendingDocumentNamed}
  />
);
