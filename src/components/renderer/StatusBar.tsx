import { Box, Text } from "@mantine/core";

type StatusBarProps = {
  breadcrumbText: string;
  onClick: () => void;
};

export const StatusBar = ({ breadcrumbText, onClick }: StatusBarProps) => {
  return (
    <Box
      onClick={onClick}
      h="100%"
      style={{
        backgroundColor: "var(--mantine-color-body)",
        display: "flex",
        alignItems: "center",
        paddingLeft: "var(--mantine-spacing-sm)",
        paddingRight: "var(--mantine-spacing-sm)",
        cursor: "pointer",
        fontSize: "11px",
        fontFamily: "var(--mantine-font-family-monospace)",
        color: "var(--mantine-color-dimmed)",
        transition: "background-color 0.15s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor =
          "var(--mantine-color-default-hover)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = "var(--mantine-color-body)";
      }}
    >
      <Text size="xs" c="dimmed" style={{ userSelect: "none", lineHeight: 1 }}>
        {breadcrumbText}
      </Text>
    </Box>
  );
};
