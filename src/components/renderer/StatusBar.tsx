import { Box, Text, Group } from "@mantine/core";
import "./StatusBar.css";

type StatusBarProps = {
  breadcrumbText: string;
  onClick: () => void;
};

export const StatusBar = ({ breadcrumbText, onClick }: StatusBarProps) => {
  return (
    <Box
      component="header"
      className="app-title-bar"
      h="100%"
      style={{
        backgroundColor: "var(--mantine-color-body)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        paddingLeft: "max(var(--mantine-spacing-sm), 78px)",
        paddingRight: "var(--mantine-spacing-sm)",
        fontSize: "11px",
        fontFamily: "var(--mantine-font-family-monospace)",
        color: "var(--mantine-color-dimmed)",
      }}
    >
      <Group gap="xs" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
        <Box
          className="app-title-bar__control"
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
      </Group>
    </Box>
  );
};
