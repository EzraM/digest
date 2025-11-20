import {
  Box,
  Group,
  Text,
  TextInput,
  useComputedColorScheme,
  useMantineTheme,
} from "@mantine/core";
import { useCallback } from "react";
import type {
  HTMLAttributes,
  KeyboardEvent,
  DragEvent,
} from "react";
import { DocumentRecord, ProfileRecord } from "../../types/documents";
import { DocumentActions } from "./DocumentActions";

type DropPosition = "before" | "after" | "inside";

type DocumentTreeNodeProps = {
  document: DocumentRecord;
  depth: number;
  isActive: boolean;
  isEditing: boolean;
  editingValue: string;
  onChangeEditingValue: (value: string) => void;
  onSubmitEditing: () => void;
  onCancelEditing: () => void;
  onStartRename: () => void;
  onCreateChild: () => void;
  onDeleteDocument: () => void;
  onMoveToProfile: (profileId: string) => void;
  canCreateChild: boolean;
  profiles: ProfileRecord[];
  elementProps: HTMLAttributes<HTMLDivElement>;
  draggable?: boolean;
  isDragging: boolean;
  dropPosition: DropPosition | null;
  onDragStart?: (event: DragEvent<HTMLDivElement>) => void;
  onDragEnd?: (event: DragEvent<HTMLDivElement>) => void;
  onDragOver?: (event: DragEvent<HTMLDivElement>) => void;
  onDragLeave?: () => void;
  onDrop?: (event: DragEvent<HTMLDivElement>) => void;
};

export const DocumentTreeNode = ({
  document,
  isActive,
  isEditing,
  editingValue,
  onChangeEditingValue,
  onSubmitEditing,
  onCancelEditing,
  onStartRename,
  onCreateChild,
  onDeleteDocument,
  onMoveToProfile,
  canCreateChild,
  profiles,
  elementProps,
  draggable = true,
  isDragging,
  dropPosition,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
}: DocumentTreeNodeProps) => {
  const theme = useMantineTheme();
  const colorScheme = useComputedColorScheme("light");

  const handleInputKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        onSubmitEditing();
      } else if (event.key === "Escape") {
        event.preventDefault();
        onCancelEditing();
      }
    },
    [onSubmitEditing, onCancelEditing]
  );

  const title = document.title?.trim() ? document.title : "Untitled Document";
  const dropIndicatorColor =
    colorScheme === "dark" ? theme.colors.blue[4] : theme.colors.blue[5];
  const baseBackground = isActive
    ? colorScheme === "dark"
      ? theme.colors.blue[8]
      : theme.colors.blue[0]
    : undefined;
  let backgroundColor = baseBackground;
  let boxShadow: string | undefined;

  if (dropPosition === "before") {
    boxShadow = `inset 0 2px 0 ${dropIndicatorColor}`;
  } else if (dropPosition === "after") {
    boxShadow = `inset 0 -2px 0 ${dropIndicatorColor}`;
  } else if (dropPosition === "inside") {
    backgroundColor =
      colorScheme === "dark" ? theme.colors.blue[9] : theme.colors.blue[1];
  }

  return (
    <Box
      {...elementProps}
      style={{
        ...elementProps.style,
        borderRadius: theme.radius.sm,
        padding: "4px 8px",
        backgroundColor,
        opacity: isDragging ? 0.6 : 1,
        ...(boxShadow ? { boxShadow } : {}),
      }}
      data-active={isActive || undefined}
      draggable={draggable}
      onDragStart={draggable ? onDragStart : undefined}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDoubleClick={(event) => {
        elementProps.onDoubleClick?.(event);
        event.preventDefault();
        onStartRename();
      }}
    >
      <Group gap="xs" wrap="nowrap" justify="space-between" align="center">
        <Box style={{ flex: 1, minWidth: 0 }}>
          {isEditing ? (
            <TextInput
              size="xs"
              value={editingValue}
              onChange={(event) => onChangeEditingValue(event.currentTarget.value)}
              autoFocus
              onFocus={(event) => event.currentTarget.select()}
              variant="filled"
              onBlur={() => onSubmitEditing()}
              onKeyDown={handleInputKeyDown}
              onClick={(event) => event.stopPropagation()}
              spellCheck={false}
            />
          ) : (
            <Text
              size="sm"
              fw={isActive ? 600 : 500}
              c={
                isActive
                  ? colorScheme === "dark"
                    ? theme.white
                    : theme.colors.blue[7]
                  : undefined
              }
              style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
            >
              {title}
            </Text>
          )}
        </Box>

        {!isEditing && (
          <Box
            onClick={(event) => {
              event.stopPropagation();
            }}
          >
            <DocumentActions
              document={document}
              profiles={profiles}
              canCreateChild={canCreateChild}
              onCreateChild={onCreateChild}
              onRename={onStartRename}
              onDelete={onDeleteDocument}
              onMoveToProfile={onMoveToProfile}
            />
          </Box>
        )}
      </Group>
    </Box>
  );
};
