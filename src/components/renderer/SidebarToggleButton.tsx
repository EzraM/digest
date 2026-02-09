import { useMantineColorScheme } from "@mantine/core";
import { sidebarButtonColors } from "../../config/theme";

type SidebarToggleButtonProps = {
  isOpen: boolean;
  onToggle: () => void;
};

export const SidebarToggleButton = ({
  isOpen,
  onToggle,
}: SidebarToggleButtonProps) => {
  const { colorScheme } = useMantineColorScheme();
  const colors =
    sidebarButtonColors.navigation[colorScheme === "dark" ? "dark" : "light"];

  return (
    <button
      type="button"
      onClick={onToggle}
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: "2rem",
        height: "100%",
        border: "none",
        borderRight: `1px solid ${colors.border}`,
        backgroundColor: colors.background,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 0,
        transition: "background-color 150ms ease",
      }}
      title={isOpen ? "Collapse sidebar" : "Expand sidebar"}
      aria-label={isOpen ? "Collapse sidebar" : "Expand sidebar"}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = colors.hover;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = colors.background;
      }}
    >
      <span
        style={{
          color: colors.text,
          fontSize: "14px",
          fontWeight: 600,
          writingMode: "vertical-rl",
          textOrientation: "mixed",
          transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
          userSelect: "none",
          transition: "transform 180ms ease",
        }}
      >
        ‹
      </span>
    </button>
  );
};
