import { Button, Divider, ScrollArea, Stack, Text } from "@mantine/core";
import {
  DocumentRecord,
  DocumentTreeNode,
  ProfileRecord,
} from "../../types/documents";
import { ProfileList } from "./ProfileList";
import { DocumentTree } from "./DocumentTree";

type FileTreeProps = {
  profiles: ProfileRecord[];
  activeProfileId: string | null;
  onSelectProfile: (profileId: string) => void;
  onCreateProfile: () => void;
  onRenameProfile?: (profileId: string) => void;
  onDeleteProfile?: (profileId: string) => void;
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
    <Stack gap="md" h="100%">
      <ProfileList
        profiles={profiles}
        activeProfileId={activeProfileId}
        onSelectProfile={onSelectProfile}
        onCreateProfile={onCreateProfile}
        onRenameProfile={onRenameProfile}
        onDeleteProfile={onDeleteProfile}
      />

      <Divider />

      <Button
        size="xs"
        variant="light"
        radius="sm"
        onClick={handleCreateRootDocument}
        disabled={!activeProfileId}
      >
        New page
      </Button>

      {profiles.length === 0 ? (
        <Stack gap="xs">
          <Text size="sm" c="dimmed">
            Create a profile to start organizing documents.
          </Text>
        </Stack>
      ) : (
        <ScrollArea style={{ flex: 1 }}>
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
    </Stack>
  );
};
