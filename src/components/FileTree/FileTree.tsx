import { ScrollArea, Stack, Text } from "@mantine/core";
import {
  DocumentRecord,
  DocumentTreeNode,
  ProfileRecord,
} from "../../types/documents";
import { ProfileActionsMenu, ProfileList } from "./ProfileList";
import { DocumentTree } from "./DocumentTree";
import "./FileTree.css";

type FileTreeProps = {
  profiles: ProfileRecord[];
  activeProfileId: string | null;
  onSelectProfile: (profileId: string) => void;
  onCreateProfile: () => void;
  onRenameProfile?: (profileId: string) => void;
  onDeleteProfile?: (profileId: string) => void;
  onToggleJiraLinks?: (profileId: string, enabled: boolean) => void;
  onReorderProfiles: (profileIds: string[]) => void;
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

export const FileTree = ({
  profiles,
  activeProfileId,
  onSelectProfile,
  onCreateProfile,
  onRenameProfile,
  onDeleteProfile,
  onToggleJiraLinks,
  onReorderProfiles,
  documentTree,
  activeDocumentId,
  onSelectDocument,
  onCreateDocument,
  onRenameDocument,
  onDeleteDocument,
  onMoveDocumentToProfile,
  onMoveDocument,
  pendingEditDocumentId,
  onPendingEditConsumed,
  onPendingDocumentNamed,
}: FileTreeProps) => {
  const handleCreateRootDocument = () => {
    if (!activeProfileId) return;
    onCreateDocument({ profileId: activeProfileId });
  };

  return (
    <Stack className="file-tree" gap={0} h="100%">
      <ProfileList
        profiles={profiles}
        activeProfileId={activeProfileId}
        onSelectProfile={onSelectProfile}
        onRenameProfile={onRenameProfile}
        onDeleteProfile={onDeleteProfile}
        onToggleJiraLinks={onToggleJiraLinks}
        onReorderProfiles={onReorderProfiles}
      />

      {profiles.length === 0 ? (
        <Stack className="file-tree__empty" gap="xs">
          <Text size="sm" c="dimmed">
            Create a profile to start organizing documents.
          </Text>
        </Stack>
      ) : (
        <ScrollArea className="file-tree__scroll">
          <DocumentTree
            profiles={profiles}
            tree={documentTree}
            activeDocumentId={activeDocumentId}
            onSelectDocument={onSelectDocument}
            onCreateDocument={onCreateDocument}
            onRenameDocument={onRenameDocument}
            onDeleteDocument={onDeleteDocument}
            onMoveDocumentToProfile={onMoveDocumentToProfile}
            onMoveDocument={onMoveDocument}
            pendingEditDocumentId={pendingEditDocumentId}
            onPendingEditConsumed={onPendingEditConsumed}
            onPendingDocumentNamed={onPendingDocumentNamed}
          />
        </ScrollArea>
      )}

      <div className="file-tree__footer">
        <button
          type="button"
          className="file-tree__footer-action"
          onClick={handleCreateRootDocument}
          disabled={!activeProfileId}
        >
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M8 3.25v9.5M3.25 8h9.5" />
          </svg>
          <span>New page</span>
        </button>
        <button
          type="button"
          className="file-tree__footer-action"
          onClick={onCreateProfile}
        >
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M8 3.25v9.5M3.25 8h9.5" />
          </svg>
          <span>New profile</span>
        </button>
        <ProfileActionsMenu
          profiles={profiles}
          activeProfileId={activeProfileId}
          onRenameProfile={onRenameProfile}
          onDeleteProfile={onDeleteProfile}
          onToggleJiraLinks={onToggleJiraLinks}
        />
      </div>
    </Stack>
  );
};
