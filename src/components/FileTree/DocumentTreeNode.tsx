import {
  Box,
  Group,
  Text,
  TextInput,
  useComputedColorScheme,
  useMantineTheme,
} from "@mantine/core";
import { useCallback } from "react";
import type { HTMLAttributes, KeyboardEvent } from "react";
import { DocumentRecord, ProfileRecord } from "../../types/documents";
import { DocumentActions } from "./DocumentActions";

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

  return (
    <Box
      {...elementProps}
      style={{
        ...elementProps.style,
        borderRadius: theme.radius.sm,
        padding: "4px 8px",
        backgroundColor: isActive
          ? colorScheme === "dark"
            ? theme.colors.blue[8]
            : theme.colors.blue[0]
          : undefined,
      }}
      data-active={isActive || undefined}
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
