import { Stack, Text, Tree, TreeNodeData, useTree } from "@mantine/core";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { MouseEvent } from "react";
import {
  DocumentRecord,
  DocumentTreeNode as DocumentTreeNodeType,
  ProfileRecord,
} from "../../types/documents";
import { DocumentTreeNode } from "./DocumentTreeNode";

const MAX_DOCUMENT_DEPTH = 4;

type DocumentTreeProps = {
  tree: DocumentTreeNodeType[];
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
  profiles: ProfileRecord[];
  pendingEditDocumentId: string | null;
  onPendingEditConsumed: () => void;
};

type TreeNodeMeta = {
  document: DocumentRecord;
  depth: number;
};

const useDocumentTreeController = (activeDocumentId: string | null) => {
  const treeController = useTree({ multiple: false });
  const controllerRef = useRef(treeController);
  const lastAppliedDocumentIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (controllerRef.current !== treeController) {
      controllerRef.current = treeController;
      lastAppliedDocumentIdRef.current = null;
    }
  }, [treeController]);

  useEffect(() => {
    const controller = controllerRef.current;

    if (!activeDocumentId) {
      if (lastAppliedDocumentIdRef.current !== null) {
        controller.clearSelected();
        lastAppliedDocumentIdRef.current = null;
      }
      return;
    }

    if (lastAppliedDocumentIdRef.current === activeDocumentId) {
      return;
    }

    controller.setSelectedState([activeDocumentId]);
    lastAppliedDocumentIdRef.current = activeDocumentId;
  }, [activeDocumentId]);

  return treeController;
};

const mapTreeToData = (
  nodes: DocumentTreeNodeType[],
  depth = 0
): TreeNodeData[] => {
  return nodes.map((node) => ({
    value: node.document.id,
    label: node.document.title ?? "Untitled Document",
    nodeProps: {
      document: node.document,
      depth,
    },
    children: node.children ? mapTreeToData(node.children, depth + 1) : undefined,
  }));
};

const findDocumentById = (
  nodes: DocumentTreeNodeType[],
  documentId: string
): DocumentRecord | null => {
  for (const node of nodes) {
    if (node.document.id === documentId) {
      return node.document;
    }
    if (node.children) {
      const child = findDocumentById(node.children, documentId);
      if (child) return child;
    }
  }
  return null;
};

const useDocumentTreeEditing = ({
  tree,
  pendingEditDocumentId,
  onPendingEditConsumed,
  onRenameDocument,
}: {
  tree: DocumentTreeNodeType[];
  pendingEditDocumentId: string | null;
  onPendingEditConsumed: () => void;
  onRenameDocument: (
    documentId: string,
    title: string
  ) => Promise<DocumentRecord | null>;
}) => {
  const [editingDocumentId, setEditingDocumentId] = useState<string | null>(
    null
  );
  const [editingValue, setEditingValue] = useState("");

  const startEditing = useCallback((document: DocumentRecord) => {
    setEditingDocumentId(document.id);
    setEditingValue(document.title ?? "Untitled Document");
  }, []);

  const cancelEditing = useCallback(() => {
    setEditingDocumentId(null);
    setEditingValue("");
  }, []);

  const handleRenameSubmit = useCallback(async () => {
    if (!editingDocumentId) {
      return;
    }

    const trimmed = editingValue.trim() || "Untitled Document";
    const current = findDocumentById(tree, editingDocumentId);
    const currentTitle = current?.title ?? "Untitled Document";

    if (trimmed === currentTitle) {
      cancelEditing();
      return;
    }

    const result = await onRenameDocument(editingDocumentId, trimmed);
    if (result) {
      cancelEditing();
    }
  }, [editingDocumentId, editingValue, tree, onRenameDocument, cancelEditing]);

  useEffect(() => {
    if (!pendingEditDocumentId) {
      return;
    }

    const document = findDocumentById(tree, pendingEditDocumentId);
    if (document) {
      startEditing(document);
      onPendingEditConsumed();
    }
  }, [pendingEditDocumentId, tree, startEditing, onPendingEditConsumed]);

  return {
    editingDocumentId,
    editingValue,
    setEditingValue,
    startEditing,
    cancelEditing,
    handleRenameSubmit,
  };
};

export const DocumentTree = ({
  tree,
  activeDocumentId,
  onSelectDocument,
  onCreateDocument,
  onRenameDocument,
  onDeleteDocument,
  onMoveDocumentToProfile,
  profiles,
  pendingEditDocumentId,
  onPendingEditConsumed,
}: DocumentTreeProps) => {
  const treeController = useDocumentTreeController(activeDocumentId);
  const treeData = useMemo(() => mapTreeToData(tree), [tree]);
  const {
    editingDocumentId,
    editingValue,
    setEditingValue,
    startEditing,
    cancelEditing,
    handleRenameSubmit,
  } = useDocumentTreeEditing({
    tree,
    pendingEditDocumentId,
    onPendingEditConsumed,
    onRenameDocument,
  });

  const handleCreateChild = useCallback(
    async (document: DocumentRecord) => {
      await onCreateDocument({
        profileId: document.profileId,
        parentDocumentId: document.id,
      });
    },
    [onCreateDocument]
  );

  const handleDelete = useCallback(
    async (document: DocumentRecord) => {
      const confirmed = window.confirm(
        `Delete "${document.title ?? "Untitled Document"}"?`
      );
      if (!confirmed) {
        return;
      }
      await onDeleteDocument(document.id);
    },
    [onDeleteDocument]
  );

  const handleMoveProfile = useCallback(
    async (document: DocumentRecord, profileId: string) => {
      await onMoveDocumentToProfile(document.id, profileId);
    },
    [onMoveDocumentToProfile]
  );

  if (!tree.length) {
    return (
      <Stack
        gap="xs"
        p="sm"
        bg="gray.0"
        c="dimmed"
        style={{ borderRadius: 8 }}
      >
        <Text size="sm" fw={500}>
          No documents yet
        </Text>
        <Text size="xs">
          Create a document to get started inside the selected profile.
        </Text>
      </Stack>
    );
  }

  return (
    <Tree
      data={treeData}
      tree={treeController}
      levelOffset="md"
      selectOnClick
      renderNode={({ node, elementProps, selected }) => {
        const nodeProps = node.nodeProps as TreeNodeMeta | undefined;
        const document = nodeProps?.document;
        if (!document || typeof nodeProps?.depth !== "number") {
          return null;
        }
        const isActive = selected || document.id === activeDocumentId;
        const isEditing = editingDocumentId === document.id;
        const canCreateChild = nodeProps.depth < MAX_DOCUMENT_DEPTH - 1;
        const enhancedElementProps = {
          ...elementProps,
          onClick: (event: MouseEvent<HTMLDivElement>) => {
            elementProps.onClick(event);
            onSelectDocument(document.id);
          },
        };

        return (
          <DocumentTreeNode
            document={document}
            depth={nodeProps.depth}
            isActive={isActive}
            isEditing={isEditing}
            editingValue={isEditing ? editingValue : ""}
            onChangeEditingValue={(value) => setEditingValue(value)}
            onSubmitEditing={handleRenameSubmit}
            onCancelEditing={cancelEditing}
            onStartRename={() => startEditing(document)}
            onCreateChild={() => handleCreateChild(document)}
            onDeleteDocument={() => handleDelete(document)}
            onMoveToProfile={(profileId) =>
              handleMoveProfile(document, profileId)
            }
            canCreateChild={canCreateChild}
            profiles={profiles}
            elementProps={enhancedElementProps}
          />
        );
      }}
    />
  );
};
