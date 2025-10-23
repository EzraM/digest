import { type ReactNode, type RefCallback } from "react";
import { Box, Group, Paper } from "@mantine/core";

interface SearchBlockShellProps {
  contentRef: RefCallback<HTMLElement>;
  action: ReactNode;
}

export const SearchBlockShell = ({
  contentRef,
  action,
}: SearchBlockShellProps) => {
  return (
    <Paper
      withBorder
      radius="md"
      px="md"
      py="sm"
      className="bn-default-styles"
      style={{ width: "100%" }}
    >
      <Group align="center" gap="sm" wrap="nowrap">
        <Box
          ref={contentRef}
          className="bn-default-styles"
          style={{
            flex: 1,
            outline: "none",
            minHeight: "32px",
          }}
        />
        {action}
      </Group>
    </Paper>
  );
};
