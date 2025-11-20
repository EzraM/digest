import { Stack, Text, Tree, TreeNodeData, useTree } from "@mantine/core";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { MouseEvent, DragEvent } from "react";
import {
  DocumentRecord,
  DocumentTreeNode as DocumentTreeNodeType,
  ProfileRecord,
} from "../../types/documents";
import { DocumentTreeNode } from "./DocumentTreeNode";
import { MAX_DOCUMENT_DEPTH } from "../../config/documents";

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
  onMoveDocument: (params: {
    documentId: string;
    newParentId: string | null;
    position: number;
  }) => Promise<boolean>;
  profiles: ProfileRecord[];
  pendingEditDocumentId: string | null;
  onPendingEditConsumed: () => void;
  onPendingDocumentNamed?: (document: DocumentRecord) => void;
};

type TreeNodeMeta = {
  document: DocumentRecord;
  depth: number;
};

type DropPosition = "before" | "after" | "inside";

type DropTargetState = {
  targetId: string;
  position: DropPosition;
};

type HierarchyMetadata = {
  byId: Map<
    string,
    {
      document: DocumentRecord;
      depth: number;
      parentId: string | null;
    }
  >;
  childrenByParent: Map<string | null, string[]>;
  subtreeHeights: Map<string, number>;
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
  onPendingDocumentNamed,
}: {
  tree: DocumentTreeNodeType[];
  pendingEditDocumentId: string | null;
  onPendingEditConsumed: () => void;
  onRenameDocument: (
    documentId: string,
    title: string
  ) => Promise<DocumentRecord | null>;
  onPendingDocumentNamed?: (document: DocumentRecord) => void;
}) => {
  const [editingDocumentId, setEditingDocumentId] = useState<string | null>(
    null
  );
  const [editingValue, setEditingValue] = useState("");
  const [editingContext, setEditingContext] = useState<"manual" | "pending" | null>(null);

  const startEditing = useCallback(
    (document: DocumentRecord, context: "manual" | "pending" = "manual") => {
      setEditingDocumentId(document.id);
      setEditingValue(document.title ?? "Untitled Document");
      setEditingContext(context);
    },
    []
  );

  const finishEditing = useCallback(
    (document?: DocumentRecord | null) => {
      if (
        document &&
        editingContext === "pending" &&
        typeof onPendingDocumentNamed === "function"
      ) {
        onPendingDocumentNamed(document);
      }
      setEditingDocumentId(null);
      setEditingValue("");
      setEditingContext(null);
    },
    [editingContext, onPendingDocumentNamed]
  );

  const cancelEditing = useCallback(() => {
    const document = editingDocumentId
      ? findDocumentById(tree, editingDocumentId)
      : null;
    finishEditing(document);
  }, [editingDocumentId, tree, finishEditing]);

  const handleRenameSubmit = useCallback(async () => {
    if (!editingDocumentId) {
      return;
    }

    const current = findDocumentById(tree, editingDocumentId);
    if (!current) {
      finishEditing(null);
      return;
    }

    const trimmed = editingValue.trim() || "Untitled Document";
    const currentTitle = current.title ?? "Untitled Document";

    if (trimmed === currentTitle) {
      finishEditing(current);
      return;
    }

    const result = await onRenameDocument(editingDocumentId, trimmed);
    if (result) {
      finishEditing(result);
    }
  }, [
    editingDocumentId,
    editingValue,
    tree,
    onRenameDocument,
    finishEditing,
  ]);

  useEffect(() => {
    if (!pendingEditDocumentId) {
      return;
    }

    const document = findDocumentById(tree, pendingEditDocumentId);
    if (document) {
      startEditing(document, "pending");
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

const buildHierarchyMetadata = (
  nodes: DocumentTreeNodeType[]
): HierarchyMetadata => {
  const byId = new Map<
    string,
    { document: DocumentRecord; depth: number; parentId: string | null }
  >();
  const childrenByParent = new Map<string | null, string[]>();
  const subtreeHeights = new Map<string, number>();

  const traverse = (
    currentNodes: DocumentTreeNodeType[],
    depth: number,
    parentId: string | null
  ): number => {
    let maxDepth = 0;
    currentNodes.forEach((node) => {
      const childIds =
        node.children?.map((child) => child.document.id) ?? [];
      byId.set(node.document.id, {
        document: node.document,
        depth,
        parentId,
      });
      childrenByParent.set(node.document.id, childIds);
      const childDepth =
        node.children && node.children.length
          ? traverse(node.children, depth + 1, node.document.id)
          : 0;
      const nodeDepth = childDepth + 1;
      subtreeHeights.set(node.document.id, nodeDepth);
      if (nodeDepth > maxDepth) {
        maxDepth = nodeDepth;
      }
    });
    return maxDepth;
  };

  childrenByParent.set(
    null,
    nodes.map((node) => node.document.id)
  );
  traverse(nodes, 0, null);

  return { byId, childrenByParent, subtreeHeights };
};

const determineDropPosition = (
  element: HTMLElement,
  clientY: number
): DropPosition => {
  const rect = element.getBoundingClientRect();
  const offsetY = clientY - rect.top;
  const threshold = Math.min(12, rect.height / 3 || 4);
  if (offsetY < threshold) {
    return "before";
  }
  if (offsetY > rect.height - threshold) {
    return "after";
  }
  return "inside";
};

export const DocumentTree = ({
  tree,
  activeDocumentId,
  onSelectDocument,
  onCreateDocument,
  onRenameDocument,
  onDeleteDocument,
  onMoveDocumentToProfile,
  onMoveDocument,
  profiles,
  pendingEditDocumentId,
  onPendingEditConsumed,
  onPendingDocumentNamed,
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
    onPendingDocumentNamed,
  });
  const hierarchyMeta = useMemo(() => buildHierarchyMetadata(tree), [tree]);
  const [draggingDocumentId, setDraggingDocumentId] = useState<string | null>(
    null
  );
  const [dropTarget, setDropTarget] = useState<DropTargetState | null>(null);

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

  const isDescendant = useCallback(
    (potentialDescendantId: string | null, ancestorId: string) => {
      let currentId = potentialDescendantId;
      const safetyLimit = hierarchyMeta.byId.size + 1;
      let steps = 0;
      while (currentId) {
        if (currentId === ancestorId) {
          return true;
        }
        const parentId =
          hierarchyMeta.byId.get(currentId)?.parentId ?? null;
        currentId = parentId;
        steps += 1;
        if (steps > safetyLimit) {
          break;
        }
      }
      return false;
    },
    [hierarchyMeta.byId]
  );

  const canDrop = useCallback(
    (dragId: string, targetId: string, position: DropPosition) => {
      if (dragId === targetId) {
        return false;
      }

      const targetMeta = hierarchyMeta.byId.get(targetId);
      const dragMeta = hierarchyMeta.byId.get(dragId);
      if (!targetMeta || !dragMeta) {
        return false;
      }

      if (isDescendant(targetId, dragId)) {
        return false;
      }

      const newParentId =
        position === "inside" ? targetMeta.document.id : targetMeta.parentId;
      const parentDepth = newParentId
        ? (hierarchyMeta.byId.get(newParentId)?.depth ?? -1)
        : -1;
      const newDepth =
        position === "inside" ? targetMeta.depth + 1 : parentDepth + 1;

      const subtreeHeight =
        hierarchyMeta.subtreeHeights.get(dragId) ?? 1;
      const deepestDepth = newDepth + subtreeHeight - 1;

      if (deepestDepth >= MAX_DOCUMENT_DEPTH) {
        return false;
      }

      return true;
    },
    [hierarchyMeta, isDescendant]
  );

  const computeDropParams = useCallback(
    (dragId: string, targetId: string, position: DropPosition) => {
      const targetMeta = hierarchyMeta.byId.get(targetId);
      if (!targetMeta) {
        return null;
      }

      if (position === "inside") {
        const childIds =
          hierarchyMeta.childrenByParent.get(targetId) ?? [];
        const filteredChildren = childIds.filter((id) => id !== dragId);
        return {
          parentId: targetId,
          index: filteredChildren.length,
        };
      }

      const parentId = targetMeta.parentId ?? null;
      const siblings =
        hierarchyMeta.childrenByParent.get(parentId) ?? [];
      const filteredSiblings = siblings.filter((id) => id !== dragId);
      const targetIndex = filteredSiblings.indexOf(targetId);
      if (targetIndex === -1) {
        return null;
      }
      const index =
        position === "before" ? targetIndex : targetIndex + 1;
      return { parentId, index };
    },
    [hierarchyMeta]
  );

  const handleDragStart = useCallback(
    (event: DragEvent<HTMLDivElement>, documentId: string) => {
      event.stopPropagation();
      setDraggingDocumentId(documentId);
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", documentId);
      }
      setDropTarget(null);
    },
    []
  );

  const handleDragEnd = useCallback(() => {
    setDraggingDocumentId(null);
    setDropTarget(null);
  }, []);

  const handleDragOver = useCallback(
    (
      event: DragEvent<HTMLDivElement>,
      documentId: string
    ) => {
      if (!draggingDocumentId) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const element = event.currentTarget as HTMLElement;
      const position = determineDropPosition(element, event.clientY);
      const valid = canDrop(draggingDocumentId, documentId, position);
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = valid ? "move" : "none";
      }
      if (valid) {
        setDropTarget({ targetId: documentId, position });
      } else if (dropTarget?.targetId === documentId) {
        setDropTarget(null);
      }
    },
    [draggingDocumentId, canDrop, dropTarget]
  );

  const handleDrop = useCallback(
    async (
      event: DragEvent<HTMLDivElement>,
      documentId: string
    ) => {
      if (!draggingDocumentId) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const element = event.currentTarget as HTMLElement;
      const position = determineDropPosition(element, event.clientY);
      if (!canDrop(draggingDocumentId, documentId, position)) {
        return;
      }

      const dropParams = computeDropParams(
        draggingDocumentId,
        documentId,
        position
      );

      if (!dropParams) {
        return;
      }

      const success = await onMoveDocument({
        documentId: draggingDocumentId,
        newParentId: dropParams.parentId,
        position: dropParams.index,
      });

      if (!success) {
        console.error("Failed to move document");
      }

      setDraggingDocumentId(null);
      setDropTarget(null);
    },
    [draggingDocumentId, canDrop, computeDropParams, onMoveDocument]
  );

  const handleDragLeave = useCallback((documentId: string) => {
    setDropTarget((current) =>
      current?.targetId === documentId ? null : current
    );
  }, []);

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
        const dropPosition =
          dropTarget?.targetId === document.id ? dropTarget.position : null;

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
            draggable={!isEditing}
            isDragging={draggingDocumentId === document.id}
            dropPosition={dropPosition}
            onDragStart={(event) => handleDragStart(event, document.id)}
            onDragEnd={handleDragEnd}
            onDragOver={(event) => handleDragOver(event, document.id)}
            onDrop={(event) => handleDrop(event, document.id)}
            onDragLeave={() => handleDragLeave(document.id)}
            elementProps={enhancedElementProps}
          />
        );
      }}
    />
  );
};
