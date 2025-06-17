import React from "react";
import { Text } from "@mantine/core";

interface CostDisplayProps {
  queryCost: number;
  sessionTotal: number;
  hasCostData: boolean;
}

export const CostDisplay: React.FC<CostDisplayProps> = ({
  queryCost,
  sessionTotal,
  hasCostData,
}) => {
  return (
    <Text
      size="xs"
      c="dimmed"
      style={{
        fontSize: "11px",
        display: "flex",
        alignItems: "center",
        gap: "4px",
        fontFamily: "monospace",
      }}
    >
      {hasCostData ? (
        <>
          <span>Query: ${queryCost.toFixed(4)}</span>
          <span>•</span>
          <span>Session: ${sessionTotal.toFixed(4)}</span>
        </>
      ) : (
        <>
          <span>⌘</span>
          <span>+</span>
          <span>↵</span>
          <span>to submit</span>
        </>
      )}
    </Text>
  );
};
