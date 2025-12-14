import { Box, Text, Group } from "@mantine/core";
import { useContext } from "react";
import { ClipDraftContext } from "../../context/ClipDraftContext";
import { ClipButtons } from "../clip/ClipButtons";

type StatusBarProps = {
  breadcrumbText: string;
  onClick: () => void;
};

export const StatusBar = ({ breadcrumbText, onClick }: StatusBarProps) => {
  const clipDraftContext = useContext(ClipDraftContext);
  const hasDrafts = clipDraftContext
    ? clipDraftContext.drafts.length > 0
    : false;

  return (
    <Box
      h="100%"
      style={{
        backgroundColor: "var(--mantine-color-body)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        paddingLeft: "var(--mantine-spacing-sm)",
        paddingRight: "var(--mantine-spacing-sm)",
        fontSize: "11px",
        fontFamily: "var(--mantine-font-family-monospace)",
        color: "var(--mantine-color-dimmed)",
      }}
    >
      <Group gap="xs" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
        <Box
          onClick={onClick}
          style={{
            minWidth: 0,
            cursor: "pointer",
            transition: "background-color 0.15s ease",
            maxWidth: "60%",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor =
              "var(--mantine-color-default-hover)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "transparent";
          }}
        >
          <Text
            size="xs"
            c="dimmed"
            style={{
              userSelect: "none",
              lineHeight: 1,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {breadcrumbText}
          </Text>
        </Box>
        <ClipButtons context="notebook" placement="toolbar" />
      </Group>
      {hasDrafts && (
        <Box
          style={{
            padding: "2px 8px",
            borderRadius: "4px",
            backgroundColor: "var(--mantine-color-blue-1)",
            color: "var(--mantine-color-blue-7)",
            fontSize: "11px",
            fontWeight: 500,
            userSelect: "none",
          }}
          title={`${clipDraftContext?.drafts.length || 0} clip draft${(clipDraftContext?.drafts.length || 0) !== 1 ? "s" : ""} pending`}
        >
          📎 {clipDraftContext?.drafts.length || 0}
        </Box>
      )}
    </Box>
  );
};
