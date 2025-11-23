import { ActionIcon, Box } from "@mantine/core";
import { Chevron } from "./Chevron";

const TOGGLE_OFFSET = 12;
const TOGGLE_TOP = "25%";
const TOGGLE_SIZE = 30;

type SidebarToggleButtonProps = {
  isOpen: boolean;
  navWidth: number;
  onToggle: () => void;
};

export const SidebarToggleButton = ({
  isOpen,
  navWidth,
  onToggle,
}: SidebarToggleButtonProps) => (
  <Box
    style={{
      position: "fixed",
      left: isOpen ? `${navWidth - TOGGLE_SIZE / 2}px` : `${TOGGLE_OFFSET}px`,
      top: TOGGLE_TOP,
      zIndex: 500,
    }}
  >
    <ActionIcon
      variant="default"
      radius="xl"
      size={TOGGLE_SIZE}
      aria-label={isOpen ? "Collapse sidebar" : "Expand sidebar"}
      onClick={onToggle}
      style={{
        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.08)",
        transition: "transform 0.15s ease",
      }}
    >
      <Chevron direction={isOpen ? "left" : "right"} />
    </ActionIcon>
  </Box>
);
