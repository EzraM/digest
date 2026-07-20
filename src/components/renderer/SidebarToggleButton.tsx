import { useMantineColorScheme } from "@mantine/core";
import { sidebarButtonColors } from "../../config/theme";

const SidebarIcon = ({ isOpen }: { isOpen: boolean }) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    aria-hidden="true"
  >
    <rect
      x="2.5"
      y="3"
      width="11"
      height="10"
      rx="1.5"
      stroke="currentColor"
      strokeWidth="1.5"
    />
    <path d="M6 3.5v9" stroke="currentColor" strokeWidth="1.25" />
    <path
      d="M3.25 4h2v8h-2z"
      fill="currentColor"
      opacity={isOpen ? 0.28 : 0.1}
    />
  </svg>
);

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
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <SidebarIcon isOpen={isOpen} />
      </span>
    </button>
  );
};
